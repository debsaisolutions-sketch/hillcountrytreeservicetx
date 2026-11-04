/**
 * Local submit tests with a mocked fetch. Does not contact TradeDeskPro.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SCRIPT = fs.readFileSync(new URL("../js/tdp-leads.js", import.meta.url), "utf8");
const PROFILE_ID = "63e7470e-fe1e-4367-aae0-56d0d6392d78";
const SUCCESS =
  "Request received. We'll contact you within 1 hour during business hours.";
const PHONE = "(830) 465-4663";
const SECRET = "X-TDP-" + "Lead-Secret";

function walk(root, acc = []) {
  acc.push(root);
  for (const child of root.children || []) walk(child, acc);
  return acc;
}

function matches(el, sel) {
  if (sel === "form") return el.tagName === "FORM";
  if (sel === 'button[type="submit"]') {
    return el.tagName === "BUTTON" && (el.getAttribute("type") === "submit" || el.type === "submit");
  }
  if (sel === "button:not([type])") {
    return el.tagName === "BUTTON" && el.getAttribute("type") == null && !el.type;
  }
  const nameMatch = sel.match(/^\[name="(.+)"\]$/);
  if (nameMatch) return el.name === nameMatch[1] || el.getAttribute("name") === nameMatch[1];
  if (sel.startsWith(".")) return String(el.className || "").split(/\s+/).includes(sel.slice(1));
  const srcMatch = sel.match(/^script\[src\*="(.+)"\]$/);
  if (srcMatch) {
    return (
      el.tagName === "SCRIPT" &&
      String(el.src || el.getAttribute("src") || "").includes(srcMatch[1])
    );
  }
  throw new Error("unsupported selector " + sel);
}

function queryAll(root, selector) {
  const parts = selector.split(",").map((part) => part.trim());
  return walk(root).filter((el) => parts.some((part) => matches(el, part)));
}

function createEl(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    style: {},
    dataset: {},
    className: "",
    id: "",
    name: "",
    type: "",
    value: "",
    disabled: false,
    hidden: false,
    textContent: "",
    tabIndex: 0,
    autocomplete: "",
    src: "",
    defer: false,
    parentNode: null,
    listeners: {},
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "name") this.name = String(value);
      if (name === "type") this.type = String(value);
      if (name === "id") this.id = String(value);
      if (name === "class") this.className = String(value);
      if (name === "src") this.src = String(value);
      if (name === "data-kind") this.dataset.kind = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    querySelector(sel) {
      return queryAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
    reset() {
      walk(this).forEach((node) => {
        if (node !== this && ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)) node.value = "";
      });
    },
  };
}

function boot(options = {}) {
  const started = options.now ?? 1_000;
  let now = started;
  const documentElement = createEl("html");
  const head = createEl("head");
  const body = createEl("body");
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const form = createEl("form");
  form.setAttribute("action", "https://example.invalid/placeholder");
  form.setAttribute("method", "post");
  const fields = options.fields || {
    name: "Ada Lopez",
    email: "ada@example.com",
    phone: "8304654663",
    service: "Tree Removal",
    area: "Kerrville",
    message: "Large oak leaning over the roof",
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = createEl(name === "message" ? "textarea" : "input");
    input.name = name;
    input.setAttribute("name", name);
    input.value = value;
    form.appendChild(input);
  }
  const honeypot = createEl("input");
  honeypot.name = "company_website";
  honeypot.setAttribute("name", "company_website");
  honeypot.value = options.honeypot || "";
  form.appendChild(honeypot);
  const button = createEl("button");
  button.type = "submit";
  button.setAttribute("type", "submit");
  button.textContent = "Request Free Estimate";
  form.appendChild(button);
  const status = createEl("p");
  status.className = "form-status";
  form.appendChild(status);
  body.appendChild(form);

  const document = {
    documentElement,
    head,
    body,
    readyState: "complete",
    createElement: (tag) => createEl(tag),
    querySelector: (sel) => queryAll(documentElement, sel)[0] || null,
    querySelectorAll: (sel) => queryAll(documentElement, sel),
    addEventListener() {},
  };

  const calls = [];
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Date: { now: () => now },
    document,
    window: {
      document,
      location: {
        href: options.href || "https://hillcountrytreeservicetx.com/#contact",
        search: options.search || "",
      },
      tdpLeadAttribution: options.attribution,
    },
  };
  sandbox.location = sandbox.window.location;
  sandbox.fetch = async (url, init) => {
    calls.push({ url, init, disabled: button.disabled, label: button.textContent });
    if (options.fetchImpl) return options.fetchImpl(url, init);
    return { ok: true, status: 201 };
  };
  sandbox.window.fetch = (...args) => sandbox.fetch(...args);
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  if (options.advance !== false) now = started + 3_000;

  return {
    form,
    button,
    status,
    calls,
    setNow(value) {
      now = value;
    },
    async submit() {
      const handler = form.listeners.submit && form.listeners.submit[0];
      assert.ok(handler, "submit handler wired");
      await handler({ preventDefault() {} });
    },
  };
}

const full = boot({
  href: "https://hillcountrytreeservicetx.com/?utm_source=google&utm_medium=cpc&utm_campaign=oaks#contact",
  search: "?utm_source=google&utm_medium=cpc&utm_campaign=oaks",
  attribution() {
    return {
      first_touch_url: "https://hillcountrytreeservicetx.com/?utm_source=google",
      utm_content: "ad",
      utm_source: "",
    };
  },
});

assert.equal(full.form.getAttribute("action"), null);
assert.equal(full.form.getAttribute("method"), null);
assert.equal(full.form.querySelectorAll('[name="company_website"]').length, 1);

await full.submit();
assert.equal(full.calls.length, 1);
assert.equal(full.calls[0].url, "https://www.tradedeskpro.com/api/leads");
assert.equal(full.calls[0].init.method, "POST");
assert.equal(JSON.stringify(full.calls[0].init.headers), JSON.stringify({ "Content-Type": "application/json" }));
assert.equal(JSON.stringify(full.calls[0].init.headers).includes(SECRET), false);
assert.equal(full.calls[0].disabled, true);
assert.equal(full.calls[0].label, "Sending...");
assert.equal(full.button.disabled, false);
assert.equal(full.button.textContent, "Request Free Estimate");

const body = JSON.parse(full.calls[0].init.body);
assert.equal(body.name, "Ada Lopez");
assert.equal(body.profile_id, PROFILE_ID);
assert.equal(body.phone, "8304654663");
assert.equal(body.email, "ada@example.com");
assert.equal(body.source, "hillcountrytreeservicetx.com");
assert.equal(
  body.message,
  "Service: Tree Removal\nArea: Kerrville\nLarge oak leaning over the roof"
);
assert.equal(
  body.landing_url,
  "https://hillcountrytreeservicetx.com/?utm_source=google&utm_medium=cpc&utm_campaign=oaks"
);
assert.equal(body.first_touch_url, "https://hillcountrytreeservicetx.com/?utm_source=google");
assert.equal(body.utm_source, "google");
assert.equal(body.utm_medium, "cpc");
assert.equal(body.utm_campaign, "oaks");
assert.equal(body.utm_content, "ad");
assert.equal(Object.hasOwn(body, "utm_term"), false);
assert.equal(full.status.textContent, SUCCESS);
assert.equal(full.status.dataset.kind, "success");
assert.equal(full.form.querySelector('[name="name"]').value, "");

for (const status of [202, 200]) {
  const page = boot({
    fetchImpl: async () => ({ ok: true, status }),
  });
  await page.submit();
  assert.equal(page.calls.length, 1, "status " + status);
  assert.equal(page.status.dataset.kind, "success");
  assert.equal(page.status.textContent, SUCCESS);
}

const denied = boot({ fetchImpl: async () => ({ ok: false, status: 403 }) });
await denied.submit();
assert.equal(denied.status.dataset.kind, "error");
assert.match(denied.status.textContent, /couldn't send your request/);
assert.match(denied.status.textContent, new RegExp(PHONE.replace(/[()]/g, "\\$&")));
assert.equal(denied.button.disabled, false);

const limited = boot({ fetchImpl: async () => ({ ok: false, status: 429 }) });
await limited.submit();
assert.match(limited.status.textContent, /lot of requests/);
assert.match(limited.status.textContent, /465-4663/);
assert.equal(limited.status.dataset.kind, "error");

const broken = boot({
  fetchImpl: async () => {
    throw new Error("offline");
  },
});
await broken.submit();
assert.match(broken.status.textContent, /Something went wrong/);
assert.match(broken.status.textContent, /465-4663/);
assert.equal(broken.button.textContent, "Request Free Estimate");

const spam = boot({ honeypot: "https://spam.example" });
await spam.submit();
assert.equal(spam.calls.length, 0);
assert.equal(spam.status.dataset.kind, "success");
assert.equal(spam.status.textContent, SUCCESS);

const tooFast = boot({ now: 1_000, advance: false });
tooFast.setNow(2_500);
await tooFast.submit();
assert.equal(tooFast.calls.length, 0);
assert.equal(tooFast.status.dataset.kind, "success");
tooFast.setNow(4_000);
tooFast.form.querySelector('[name="name"]').value = "Ada Lopez";
tooFast.form.querySelector('[name="phone"]').value = "8304654663";
tooFast.form.querySelector('[name="message"]').value = "Need trimming";
await tooFast.submit();
assert.equal(tooFast.calls.length, 1);
assert.equal(JSON.parse(tooFast.calls[0].init.body).message, "Need trimming");

const nameless = boot({ fields: { name: "  ", phone: "8304654663", message: "Hello" } });
await nameless.submit();
assert.equal(nameless.calls.length, 0);
assert.match(nameless.status.textContent, /enter your name/);
assert.match(nameless.status.textContent, /465-4663/);

const phoneless = boot({ fields: { name: "Ada Lopez", phone: "", message: "Hello" } });
await phoneless.submit();
assert.equal(phoneless.calls.length, 0);
assert.match(phoneless.status.textContent, /phone number/);

console.log("tdp-leads mocked fetch tests passed.");
