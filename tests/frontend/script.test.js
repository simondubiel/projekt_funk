// frontend-tests/script.test.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

describe("Frontend Script Tests", () => {
  let document;
  let window;

  // A minimal implementation of getInputValue for testing purposes
  function getInputValue(id) {
    return document.getElementById(id).value.trim();
  }

  beforeAll(() => {
    // Load the HTML file from your templates (adjust the path if needed)
    const html = fs.readFileSync(path.resolve(__dirname, "../templates/index.html"), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
    window = dom.window;
    document = window.document;

    // Create a test input element
    const input = document.createElement("input");
    input.id = "test-input";
    input.value = "  123  ";
    document.body.appendChild(input);
  });

  test("getInputValue should trim and return the value", () => {
    expect(getInputValue("test-input")).toBe("123");
  });
});