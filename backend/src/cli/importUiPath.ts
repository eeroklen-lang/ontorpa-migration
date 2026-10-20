import fs from "fs";
import path from "path";
import { buildMigrationReport } from "../analysis/migrationReport";
import { migrationTargets } from "../analysis/migrationTargets";
import { generatePadFlow } from "../botLinkers/powerAutomateDesktopLinker/PowerAutomateDesktopLinker";
import { generateBpmn } from "../bpmn/bpmnGenerator";
import { importProject } from "../importers/uipath/UiPathImporter";
import {
  portfolioCsv,
  portfolioMarkdown,
  PortfolioRow,
  renderProcessTree,
  renderReport,
} from "./formatting";

const USAGE = `Usage: npm run import:uipath -- [--summary] [--pad] [--out <dir>] <folder>...

Imports every UiPath project found in the folders (a folder with project.json or Main.xaml),
prints its process tree and migration report, and ends with a portfolio table.

  --summary     print only the portfolio table
  --pad         also print the Power Automate Desktop skeleton of each bot
  --out <dir>   also write <bot>.json (import result + report), <bot>.pad.txt,
                <bot>.bpmn (diagram), portfolio.md and portfolio.csv`;


// Folders that never contain workflows: Studio metadata, git, dependencies
const SKIPPED_DIRECTORIES = /^(\.|node_modules$)/;

function main(args: string[]) {
  let summaryOnly = false;
  let printPad = false;
  let outDir: string | undefined;
  const folders: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--summary") {
      summaryOnly = true;
    } else if (args[i] === "--pad") {
      printPad = true;
    } else if (args[i] === "--out") {
      outDir = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(USAGE);
      return;
    } else {
      folders.push(args[i]);
    }
  }
  if (folders.length === 0 || (args.includes("--out") && !outDir)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const rows: PortfolioRow[] = [];
  for (const folder of folders) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      console.error(`Not a folder: ${folder}`);
      process.exitCode = 1;
      continue;
    }
    const roots = findProjectRoots(folder);
    if (roots.length === 0) {
      console.error(`No UiPath project (project.json or Main.xaml) found in ${folder}`);
      process.exitCode = 1;
    }
    for (const root of roots) {
      const displayPath = path.relative(process.cwd(), root) || ".";
      const imported = importProject(readProjectFiles(root), { name: fallbackName(root, folder) });
      const report = buildMigrationReport(imported, migrationTargets.pad);
      const padFlow = generatePadFlow(imported.name, imported.processTree);
      rows.push({ path: displayPath, report });

      if (!summaryOnly) {
        console.log(`\n=== ${displayPath}`);
        renderReport(report).forEach((line) => console.log(line));
        console.log("");
        renderProcessTree(imported.processTree.tree, imported.processTree.nodeInfo).forEach(
          (line) => console.log(line)
        );
        if (printPad) {
          console.log(`\n--- Power Automate Desktop skeleton\n`);
          console.log(padFlow);
        }
      }
      if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const file = path.join(outDir, slug(displayPath));
        fs.writeFileSync(`${file}.json`, JSON.stringify({ import: imported, report }, null, 2));
        fs.writeFileSync(`${file}.pad.txt`, padFlow);
        fs.writeFileSync(`${file}.bpmn`, generateBpmn(imported.processTree));
      }
    }
  }

  if (rows.length > 0) {
    console.log(`\n=== Portfolio (${rows.length} ${rows.length === 1 ? "bot" : "bots"})\n`);
    console.log(portfolioMarkdown(rows));
  }
  if (outDir && rows.length > 0) {
    fs.writeFileSync(path.join(outDir, "portfolio.md"), portfolioMarkdown(rows) + "\n");
    fs.writeFileSync(path.join(outDir, "portfolio.csv"), portfolioCsv(rows) + "\n");
    console.log(`\nWrote ${rows.length} bot reports and the portfolio table to ${outDir}`);
  }
}

/** The folder itself if it holds a project, else the top-most project folders below it. */
function findProjectRoots(folder: string): string[] {
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && (e.name === "project.json" || e.name === "Main.xaml"))) {
    return [folder];
  }
  return entries
    .filter((e) => e.isDirectory() && !SKIPPED_DIRECTORIES.test(e.name))
    .flatMap((e) => findProjectRoots(path.join(folder, e.name)));
}

/** Workflow and JSON files with their content; other files by name only (e.g. Data/Config.xlsx). */
function readProjectFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.test(entry.name)) {
          walk(full);
        }
      } else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join("/");
        files[relative] = /\.(xaml|json)$/i.test(entry.name) ? fs.readFileSync(full, "utf8") : "";
      }
    }
  };
  walk(root);
  return files;
}

// Folder names that say nothing about the bot, e.g. in Studio template packages
// (Template/contentFiles/any/any/pt0/VisualBasic)
const GENERIC_FOLDER = /^(VisualBasic|CSharp|contentFiles|any|pt\d+)$/i;

/** Name for bots without a project.json name: the nearest folder name that is not generic. */
function fallbackName(root: string, folder: string): string {
  let current = path.resolve(root);
  const stop = path.dirname(path.resolve(folder));
  while (GENERIC_FOLDER.test(path.basename(current)) && path.dirname(current) !== stop) {
    current = path.dirname(current);
  }
  return path.basename(current);
}

function slug(text: string): string {
  return text.replace(/^[./]+/, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "bot";
}

main(process.argv.slice(2));
