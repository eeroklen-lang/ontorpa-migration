import fs from "fs";
import path from "path";

/**
 * UiPath bots in the git-ignored samples/ folder (see docs/PLAN.md): the Studio templates, the
 * public dev corpus (docs/corpus/) and the client eval set. Each set is skipped when absent.
 */
export const samplesDir = path.resolve(__dirname, "../../samples");
const SAMPLE_SETS = ["uipath-studio-templates", "public", "client"];

/** Real UiPath Studio templates (see docs/PLAN.md, M0). */
export const templatesDir = path.join(samplesDir, "uipath-studio-templates");

export const hasTemplates = fs.existsSync(templatesDir);

/** Template projects by path relative to templatesDir: every folder with project.json or Main.xaml. */
export function templateProjects(): string[] {
  return projectsBelow(templatesDir).map((dir) => path.relative(templatesDir, dir));
}

/** The .xaml and .json files of a template project, by path relative to the project. */
export function templateFiles(project: string): Record<string, string> {
  return projectFiles(path.join(templatesDir, project));
}

export const hasSamples = SAMPLE_SETS.some((set) => fs.existsSync(path.join(samplesDir, set)));

/** Projects of every sample set, by path relative to samplesDir. */
export function sampleProjects(): string[] {
  return SAMPLE_SETS.flatMap((set) => projectsBelow(path.join(samplesDir, set))).map((dir) =>
    path.relative(samplesDir, dir)
  );
}

/** The .xaml and .json files of a sample project, by path relative to the project. */
export function sampleFiles(project: string): Record<string, string> {
  return projectFiles(path.join(samplesDir, project));
}

/** The top-most folders with project.json or Main.xaml, as the import CLI finds them. */
function projectsBelow(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && (e.name === "project.json" || e.name === "Main.xaml"))) {
    return [dir];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
    .flatMap((e) => projectsBelow(path.join(dir, e.name)));
}

function projectFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const full = path.join(root, file);
    if (!/(^|[\\/])\./.test(file) && /\.(xaml|json)$/i.test(file) && fs.statSync(full).isFile()) {
      files[file] = fs.readFileSync(full, "utf8");
    }
  }
  return files;
}
