import fs from "fs";
import path from "path";

/** Real UiPath Studio templates, downloaded to the git-ignored samples/ folder (see docs/PLAN.md). */
export const templatesDir = path.resolve(__dirname, "../../samples/uipath-studio-templates");

export const hasTemplates = fs.existsSync(templatesDir);

/** Template projects by path relative to templatesDir: every folder with project.json or Main.xaml. */
export function templateProjects(dir = templatesDir): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.name === "project.json" || e.name === "Main.xaml")) {
    return [path.relative(templatesDir, dir)];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .flatMap((e) => templateProjects(path.join(dir, e.name)));
}

/** The .xaml and .json files of a template project, by path relative to the project. */
export function templateFiles(project: string): Record<string, string> {
  const root = path.join(templatesDir, project);
  const files: Record<string, string> = {};
  for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const full = path.join(root, file);
    if (fs.statSync(full).isFile() && /\.(xaml|json)$/i.test(file)) {
      files[file] = fs.readFileSync(full, "utf8");
    }
  }
  return files;
}
