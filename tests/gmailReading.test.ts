import { describe, expect, test } from "vitest";
import { gmailMessageUrl, messageParts } from "../src/lib/pages/gmail/reading";

describe("inert, reversible message reading", () => {
 test("folds quote blocks without swallowing a later inline answer and preserves every character", () => {
  const text = "My reply\n\nOn Tuesday Alex wrote:\n> Earlier request\n> More history\n\nMy answer to the second question\n-- \nPhotographer signature\n";
  const parts = messageParts(text);
  expect(parts.map(part => part.text).join("")).toBe(text);
  expect(parts.some(part => part.kind === "quoted" && part.text.includes("Earlier request"))).toBe(true);
  expect(parts.some(part => part.kind === "body" && part.text.includes("second question"))).toBe(true);
  expect(parts.at(-1)?.kind).toBe("signature");
 });
 test("does not guess signatures from ordinary prose or execute markup", () => {
  const text = 'Thanks, Alex\n<img src="https://tracker.example.test" onerror="execute()">\nOn Wednesday I wrote: a poem';
  expect(messageParts(text)).toEqual([{kind: "body", text}]);
 });
 test("Gmail links use only a validated exact Message-ID and the connected account", () => {
  expect(gmailMessageUrl("business@example.test", "<reply@example.test>")).toBe("https://mail.google.com/mail/?authuser=business%40example.test#search/rfc822msgid%3Areply%40example.test");
  expect(gmailMessageUrl("business@example.test", "javascript:alert(1)")).toBeNull();
  expect(gmailMessageUrl(undefined, "<reply@example.test>")).toBeNull();
 });
});
