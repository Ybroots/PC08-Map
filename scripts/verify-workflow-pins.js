const fs = require("node:fs");
const path = require("node:path");

const workflowDirectory = path.join(process.cwd(), ".github", "workflows");
const immutableAction = /^[^\s@]+@[a-f0-9]{40}$/;
const truffleHogAction = "trufflesecurity/trufflehog@";
const truffleHogVersion = "3.97.0";
const failures = [];

for (const fileName of fs.readdirSync(workflowDirectory).sort()) {
  if (!/\.ya?ml$/.test(fileName)) continue;

  const filePath = path.join(workflowDirectory, fileName);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!match) continue;

    const action = match[1];
    if (!action.startsWith("./") && !immutableAction.test(action)) {
      failures.push(
        `${fileName}:${index + 1} action is not pinned to a 40-character commit SHA: ${action}`,
      );
    }

    if (!action.startsWith(truffleHogAction)) continue;

    const stepIndent = lines[index].match(/^(\s*)-/)?.[1]?.length;
    const followingLines = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextStepIndent = lines[cursor].match(/^(\s*)-\s+/)?.[1]?.length;
      if (
        stepIndent !== undefined &&
        nextStepIndent !== undefined &&
        nextStepIndent <= stepIndent
      )
        break;
      followingLines.push(lines[cursor]);
    }

    const hasPinnedVersion = followingLines.some(
      (line) =>
        line.match(/^\s*version:\s*["']?([^\s"']+)["']?\s*$/)?.[1] ===
        truffleHogVersion,
    );
    if (!hasPinnedVersion) {
      failures.push(
        `${fileName}:${index + 1} TruffleHog must pin the CLI with version: "${truffleHogVersion}"`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "All external workflow actions and TruffleHog CLI versions are immutable-pinned.",
  );
}
