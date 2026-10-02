/** Source-only proxy regression: public and authenticated media retain Media ownership. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("routes both media prefixes to the configured Media target, never WCMS", () => {
  const source = ts.createSourceFile(
    "vite.config.ts",
    readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const targets = new Map<string, string>();
  const prefixes = ["/nodics/media/v0/content", "/nodics/media"];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteral(node.name) &&
      prefixes.includes(node.name.text) &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      expect(targets.has(node.name.text)).toBe(false);
      const target = node.initializer.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "target",
      );
      expect(target).toBeDefined();
      if (target)
        targets.set(node.name.text, target.initializer.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect([...targets.keys()]).toEqual(prefixes);
  for (const prefix of prefixes) {
    expect(targets.get(prefix)).toBe(
      'env.VITE_CIRCA_MEDIA_TARGET ?? "http://127.0.0.1:4312"',
    );
    expect(targets.get(prefix)).not.toContain("WCMS");
  }
});
