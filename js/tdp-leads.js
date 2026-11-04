/**
 * Quote requests for hillcountrytreeservicetx.com → TradeDeskPro lead intake.
 * Browser pages post JSON only. Provenance fields are copied from the
 * attribution helper and from the page URL. No client secret is sent.
 */
(function () {
  var API_URL = "https://www.tradedeskpro.com/api/leads";
  var PROFILE_ID = "63e7470e-fe1e-4367-aae0-56d0d6392d78";
  var SOURCE = "hillcountrytreeservicetx.com";
  var PHONE = "(830) 465-4663";
  var MIN_MS = 3000;
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var SUCCESS =
    "Request received. We'll contact you within 1 hour during business hours.";
  var loadedAt = Date.now();

  function ensureAttributionScript() {
    if (document.querySelector('script[src*="tdp-lead-attribution.js"]')) return;
    var s = document.createElement("script");
    s.src = "https://www.tradedeskpro.com/js/tdp-lead-attribution.js";
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function field(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
  }

  function rawField(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || "") : "";
  }

  function currentUrl() {
    try {
      var u = new URL(window.location.href);
      u.hash = "";
      return u.toString();
    } catch (e) {
      return String((window.location && window.location.href) || "").split("#")[0];
    }
  }

  function queryUtm() {
    var out = {};
    try {
      var params = new URLSearchParams(window.location.search || "");
      UTM_KEYS.forEach(function (key) {
        var value = params.get(key);
        if (value) out[key] = value;
      });
    } catch (e) {}
    return out;
  }

  function attribution() {
    try {
      if (typeof window.tdpLeadAttribution === "function") {
        return window.tdpLeadAttribution() || {};
      }
    } catch (e) {}
    return {};
  }

  function buildMessage(form) {
    var service = field(form, "service");
    var area = field(form, "area") || field(form, "county");
    var details = field(form, "message") || field(form, "details");
    var lines = [];
    if (service) lines.push("Service: " + service);
    if (area) lines.push("Area: " + area);
    if (details) lines.push(details);
    return lines.join("\n");
  }

  function buildBody(form) {
    var extra = attribution();
    var utm = queryUtm();
    var body = {
      name: field(form, "name"),
      profile_id: PROFILE_ID,
      source: SOURCE,
      landing_url: currentUrl(),
    };
    var phone = field(form, "phone");
    var email = field(form, "email");
    var message = buildMessage(form);
    if (phone) body.phone = phone;
    if (email) body.email = email;
    if (message) body.message = message;
    if (extra.first_touch_url) body.first_touch_url = extra.first_touch_url;
    UTM_KEYS.forEach(function (key) {
      if (extra[key]) body[key] = extra[key];
      else if (utm[key]) body[key] = utm[key];
    });
    if (!body.landing_url && extra.landing_url) body.landing_url = extra.landing_url;
    return body;
  }

  function errorText(status) {
    if (status === 403) {
      return (
        "We couldn't send your request from this page. Please call " +
        PHONE +
        " and we'll help right away."
      );
    }
    if (status === 429) {
      return (
        "We're getting a lot of requests right now. Please call " +
        PHONE +
        " or try again in a few minutes."
      );
    }
    return "Something went wrong sending your request. Please call " + PHONE + ".";
  }

  function showStatus(form, kind, text) {
    var el = form.querySelector(".form-status");
    if (!el) {
      el = document.createElement("p");
      el.className = "form-status";
      el.setAttribute("role", "status");
      form.appendChild(el);
    }
    el.hidden = false;
    if (el.dataset) el.dataset.kind = kind;
    el.setAttribute("data-kind", kind);
    el.textContent = text;
  }

  function ensureHoneypot(form) {
    if (form.querySelector('[name="company_website"]')) return;
    var wrap = document.createElement("div");
    wrap.className = "hp-field";
    wrap.setAttribute("aria-hidden", "true");
    var input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("name", "company_website");
    input.setAttribute("tabindex", "-1");
    input.setAttribute("autocomplete", "off");
    input.tabIndex = -1;
    input.autocomplete = "off";
    wrap.appendChild(input);
    form.appendChild(wrap);
  }

  function fakeSuccess(form) {
    showStatus(form, "success", SUCCESS);
    form.reset();
  }

  function wireForm(form) {
    if (!form || (form.dataset && form.dataset.tdpWired === "1")) return;
    if (form.dataset) form.dataset.tdpWired = "1";
    form.removeAttribute("action");
    form.removeAttribute("method");
    ensureHoneypot(form);

    form.addEventListener("submit", async function (e) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();

      if (rawField(form, "company_website").trim() || Date.now() - loadedAt < MIN_MS) {
        fakeSuccess(form);
        return;
      }

      if (!field(form, "name")) {
        showStatus(form, "error", "Please enter your name, or call " + PHONE + ".");
        return;
      }
      if (!field(form, "phone")) {
        showStatus(form, "error", "Please enter your phone number, or call " + PHONE + ".");
        return;
      }

      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var original = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
      }

      try {
        var res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(form)),
        });
        if (res && res.ok) {
          showStatus(form, "success", SUCCESS);
          form.reset();
        } else {
          showStatus(form, "error", errorText(res && res.status));
        }
      } catch (err) {
        showStatus(form, "error", errorText(0));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original;
        }
      }
    });
  }

  function init() {
    ensureAttributionScript();
    document.querySelectorAll("form").forEach(wireForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
