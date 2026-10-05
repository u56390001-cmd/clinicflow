/**
 * MedBook AI Widget — Embeddable Chat Launcher
 *
 * Usage:
 *   <script src="https://app.example.com/widget.js"
 *           data-clinic="clinic-slug"
 *           data-position="bottom-right"
 *           data-language="en"
 *           data-color="#0D9488"></script>
 *
 * This script:
 * 1. Reads its own attributes from the <script> tag
 * 2. Fetches the clinic's widget settings from /api/widget/[slug]/settings
 * 3. Injects a Shadow DOM–isolated launcher + chat panel onto the host page
 * 4. Communicates with /api/widget/chat for the AI conversation
 *
 * Script attributes override the clinic-wide defaults the settings endpoint
 * returns, so one clinic can run several differently-branded sites:
 *
 *   data-clinic    (required) clinic slug
 *   data-position  bottom-right | bottom-left
 *   data-language  en | ur | ar — also sets dir on the host element
 *   data-color     #RRGGBB accent colour
 *
 * CSS isolation: all styles are scoped inside a Shadow DOM so they cannot
 * conflict with the host page's styles. No global selectors are used.
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var clinicSlug = scriptTag.getAttribute("data-clinic");
  if (!clinicSlug) {
    console.warn("[MedBook Widget] Missing data-clinic attribute.");
    return;
  }

  var baseUrl = scriptTag.src.replace(/\/widget\.js(\?.*)?$/, "");
  if (!baseUrl) {
    var urlObj = new URL(scriptTag.src);
    baseUrl = urlObj.origin;
  }

  // Placement, language and colour chosen in the website builder. The settings
  // endpoint only knows the clinic-wide default, so a site has to be able to
  // override it — otherwise the toggles in the builder would save correctly and
  // change nothing on screen.
  //
  // Read as attributes rather than fetched, so the widget can render its frame in
  // the right place immediately instead of jumping across the viewport once the
  // settings request lands.
  var hostPosition = scriptTag.getAttribute("data-position");
  var hostLanguage = scriptTag.getAttribute("data-language");
  var hostColor = scriptTag.getAttribute("data-color");

  var container = document.createElement("div");
  container.id = "medbook-widget-root";
  // Mirrors the "Language it opens in" setting from the builder. Setting it on
  // the host (rather than on individual nodes) lets the shadow DOM inherit
  // direction for the whole panel, including the message bubbles.
  if (hostLanguage) {
    container.setAttribute("lang", hostLanguage);
    container.setAttribute("dir", hostLanguage === "ar" ? "rtl" : "ltr");
  }
  document.body.appendChild(container);

  var shadow = container.attachShadow({ mode: "open" });

  var state = {
    isOpen: false,
    /* A host CTA can be clicked before the settings fetch lands. Remember the
       intent so the panel still opens the moment it is ready, instead of the
       click being swallowed. */
    openWhenReady: false,
    messages: [],
    input: "",
    pending: false,
    typing: false,
    error: null,
    sessionId: crypto.randomUUID(),
    settings: null,
    showDatePicker: false,
    serviceChosen: false,
    slotChosen: false,
  };

  function getDaysFromNow(count) {
    var days = [];
    var today = new Date();
    for (var i = 0; i < count; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var year = d.getFullYear();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var dateStr = year + "-" + month + "-" + day;
      var dayOfWeek = d.toLocaleDateString([], { weekday: "short" });
      var shortLabel = d.toLocaleDateString([], { day: "numeric", month: "short" });
      var label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayOfWeek + ", " + shortLabel;
      days.push({ label: label, shortLabel: shortLabel, dateStr: dateStr, dayOfWeek: dayOfWeek });
    }
    return days;
  }

  function lighten(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (
      "#" +
      Math.round(r + (255 - r) * f)
        .toString(16)
        .padStart(2, "0") +
      Math.round(g + (255 - g) * f)
        .toString(16)
        .padStart(2, "0") +
      Math.round(b + (255 - b) * f)
        .toString(16)
        .padStart(2, "0")
    );
  }

  function darken(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (
      "#" +
      Math.round(r * (1 - f))
        .toString(16)
        .padStart(2, "0") +
      Math.round(g * (1 - f))
        .toString(16)
        .padStart(2, "0") +
      Math.round(b * (1 - f))
        .toString(16)
        .padStart(2, "0")
    );
  }

  function fmtTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function fmtPrice(price) {
    if (typeof price !== "number" || !isFinite(price)) return "";
    return price === 0 ? "Free" : "$" + price.toFixed(2);
  }

  function fmtDuration(minutes) {
    if (typeof minutes !== "number" || !isFinite(minutes) || minutes < 0) return "";
    if (minutes < 60) return minutes + " min";
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return m > 0 ? h + "h " + m + "m" : h + "h";
  }

  /**
   * Strip residual markdown from model output.
   *
   * The system prompt asks for plain text, but models still slip in bold marks
   * and bullet dashes, which read as noise inside a chat bubble. Cheap to strip
   * and it keeps the panel looking like a chat rather than a pasted document.
   */
  function stripMarkdown(text) {
    return String(text)
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/`([^`]+)`/g, "$1");
  }

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    if (!state.settings) return;

    // The site's own brand colour wins over the clinic-wide default. Invalid hex
    // is ignored rather than trusted, so a bad `data-color` can never paint the
    // panel black-on-black.
    var color =
      hostColor && /^#[0-9A-Fa-f]{6}$/.test(hostColor)
        ? hostColor
        : state.settings.widget.color;
    var position = hostPosition || state.settings.widget.position;
    var agentName = state.settings.widget.agentName;
    var clinicName = state.settings.clinic.name;
    var headerSub = state.settings.widget.headerSubtitle || clinicName;
    var welcome =
      state.settings.widget.welcomeMessage ||
      "Hi! I'm " +
        agentName +
        ", the AI assistant for " +
        clinicName +
        ". How can I help you today?";
    var avatarUrl = state.settings.widget.avatarUrl;
    var isLeft = position === "bottom-left";
    var accentDark = darken(color, 0.15);

    var messagesHtml = "";
    if (state.messages.length === 0 && !state.pending) {
      messagesHtml =
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<p style="font-size:14px;color:#6B7280;line-height:1.5">' +
        esc(welcome) +
        "</p>" +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
        ["What services do you offer?", "I'd like to book an appointment", "Browse available dates"]
          .map(function (s) {
            var dataMsg = s === "Browse available dates" ? "__show_date_picker" : s;
            return (
              '<button class="w-suggest" data-msg="' +
              esc(dataMsg) +
              '">' +
              esc(s) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>";
    }

    state.messages.forEach(function (msg) {
      // Hidden messages exist only to carry appointment details back to the
      // model on later turns. Rendering them would show the visitor a wall of
      // internal bookkeeping.
      if (msg.hidden) return;

      var isUser = msg.role === "user";
      var align = isUser ? "flex-end" : "flex-start";
      var bubbleStyle = isUser
        ? "background:" + color + ";color:#fff;border-radius:16px 16px 4px 16px"
        : "border:1px solid #E5E7EB;background:#F9FAFB;color:#111827;border-radius:16px 16px 16px 4px";

      // A confirmation card speaks for itself, so its message carries no
      // caption. Everything else shows `text` — the deterministic caption when
      // a component is attached, otherwise the model's full reply.
      if (msg.text) {
        messagesHtml +=
          '<div style="display:flex;justify-content:' +
          align +
          '">' +
          '<div style="max-width:85%;white-space:pre-wrap;padding:10px 14px;font-size:14px;line-height:1.5;' +
          bubbleStyle +
          '">' +
          esc(stripMarkdown(msg.text)) +
          "</div></div>";
      }

      var component = msg.component;

      if (component && component.type === "slotList" && Array.isArray(component.data)) {
        messagesHtml +=
          '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;justify-content:' +
          align +
          '">';
        component.data.forEach(function (slot) {
          if (!slot || typeof slot.startTime !== "string") return;
          messagesHtml +=
            '<button class="w-slot" data-msg="I\'d like the ' +
            esc(fmtTime(slot.startTime)) +
            ' slot">' +
            '<div style="font-weight:600">' +
            esc(fmtTime(slot.startTime)) +
            "</div></button>";
        });
        messagesHtml += "</div>";
      }

      if (
        component &&
        component.type === "serviceList" &&
        Array.isArray(component.data)
      ) {
        messagesHtml +=
          '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;max-width:85%">';
        component.data.forEach(function (svc) {
          if (!svc || typeof svc.name !== "string") return;
          var duration = fmtDuration(svc.durationMinutes);
          var price = fmtPrice(svc.price);
          messagesHtml +=
            '<button class="w-service" data-msg="I\'d like to book &quot;' +
            esc(svc.name) +
            '&quot;">' +
            '<div style="display:flex;align-items:center;gap:12px;width:100%">' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;font-size:13px;color:#111827;line-height:1.3">' +
            esc(svc.name) +
            "</div>" +
            (svc.description
              ? '<div style="font-size:12px;color:#6B7280;line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
                esc(svc.description) +
                "</div>"
              : "") +
            (duration
              ? '<div style="font-size:11px;color:#9CA3AF;margin-top:3px">' +
                esc(duration) +
                "</div>"
              : "") +
            "</div>" +
            (price
              ? '<div style="font-weight:600;font-size:14px;color:' +
                color +
                ";white-space:nowrap;flex-shrink:0\">" +
                esc(price) +
                "</div>"
              : "") +
            "</div></button>";
        });
        messagesHtml += "</div>";
      }

      if (
        component &&
        component.type === "confirmation" &&
        component.data &&
        typeof component.data.startTime === "string"
      ) {
        var booking = component.data;
        messagesHtml +=
          '<div style="margin-top:8px;padding:14px;border-radius:12px;border:2px solid ' +
          lighten(color, 0.5) +
          ";background:" +
          lighten(color, 0.96) +
          ';max-width:85%">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' +
          color +
          '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>' +
          '<span style="font-weight:600;font-size:14px;color:' +
          accentDark +
          '">Appointment Confirmed</span></div>' +
          (booking.serviceName
            ? '<div style="font-size:13px;color:#374151;margin-bottom:4px"><strong>Service:</strong> ' +
              esc(booking.serviceName) +
              "</div>"
            : "") +
          '<div style="font-size:13px;color:#374151;line-height:1.6">' +
          "<div><strong>Date:</strong> " +
          esc(fmtDate(booking.startTime)) +
          "</div>" +
          "<div><strong>Time:</strong> " +
          esc(fmtTime(booking.startTime)) +
          (typeof booking.endTime === "string"
            ? " – " + esc(fmtTime(booking.endTime))
            : "") +
          "</div></div></div>";
      }
    });

    if (state.typing) {
      messagesHtml +=
        '<div style="display:flex;justify-content:flex-start">' +
        '<div style="display:flex;align-items:center;gap:6px;border-radius:16px 16px 16px 4px;padding:10px 14px;border:1px solid #E5E7EB;background:#F9FAFB;font-size:14px;color:#6B7280">' +
        '<span class="w-dots"><span></span><span></span><span></span></span>' +
        esc(agentName) +
        " is typing…</div></div>";
    }

    if (state.error) {
      messagesHtml +=
        '<p role="alert" style="font-size:13px;color:#DC2626;text-align:center">' +
        esc(state.error) +
        "</p>";
    }

    var datePickerHtml = "";
    if (state.showDatePicker) {
      var days = getDaysFromNow(21);
      datePickerHtml =
        '<div style="padding:10px 12px;border-top:1px solid #F3F4F6;background:#fff;flex-shrink:0" role="group" aria-label="Select a date to browse availability">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<span style="font-size:12px;font-weight:600;color:#6B7280">Pick a date</span>' +
        '<button class="w-close-date" aria-label="Close date picker" style="background:none;border:none;padding:2px;cursor:pointer;color:#9CA3AF;display:flex;align-items:center">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
        "</button></div>" +
        '<div style="position:relative">' +
        '<button class="w-date-left" aria-label="Scroll dates left" style="position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:2;width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.95);box-shadow:0 1px 4px rgba(0,0,0,0.12);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6B7280">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
        '</button>' +
        '<div style="position:absolute;left:0;top:0;bottom:0;width:16px;background:linear-gradient(to right,#fff,transparent);pointer-events:none;z-index:1"></div>' +
        '<div class="w-date-scroll" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;touch-action:pan-x">';
      days.forEach(function (day) {
        datePickerHtml +=
          '<button class="w-date-chip" data-date="' +
          esc(day.dateStr) +
          '" data-label="' +
          esc(day.label) +
          '" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;border-radius:10px;border:1.5px solid ' +
          lighten(color, 0.4) +
          ";background:" +
          lighten(color, 0.97) +
          ';color:#374151;cursor:pointer;min-width:64px;flex-shrink:0">' +
          '<span style="font-size:11px;font-weight:600;color:' +
          color +
          ';text-transform:uppercase;letter-spacing:0.02em">' +
          esc(day.dayOfWeek) +
          "</span>" +
          '<span style="font-size:12px;font-weight:500;color:#111827;white-space:nowrap">' +
          esc(day.label) +
          "</span></button>";
      });
      datePickerHtml +=
        '</div>' +
        '<div style="position:absolute;right:0;top:0;bottom:0;width:20px;background:linear-gradient(to left,#fff,transparent);pointer-events:none"></div>' +
        '<button class="w-date-right" aria-label="Scroll dates right" style="position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:2;width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.95);box-shadow:0 1px 4px rgba(0,0,0,0.12);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6B7280">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
        '</button>' +
        '</div></div>';
    }

    var panelHtml = "";
    if (state.isOpen) {
      panelHtml =
        '<div class="w-panel" role="dialog" aria-label="Chat with ' +
        esc(agentName) +
        '">' +
        // Header
        '<div class="w-header" style="background:' +
        color +
        '">' +
        '<div class="w-avatar">' +
        (avatarUrl
          ? '<img src="' + esc(avatarUrl) + '" alt="" />'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>') +
        "</div>" +
        '<div class="w-header-text"><div class="w-agent-name">' +
        esc(agentName) +
        '</div><div class="w-header-sub">' +
        esc(headerSub) +
        '</div><div class="w-status"><span class="w-status-dot"></span><span>Online</span></div></div>' +
        '<button class="w-close" aria-label="Close chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        "</div>" +
        // Messages
        '<div class="w-messages" aria-live="polite">' +
        messagesHtml +
        "</div>" +
        datePickerHtml +
        // Input
        '<form class="w-input-row">' +
        '<textarea class="w-input" rows="1" placeholder="Message ' +
        esc(agentName) +
        '…" aria-label="Message the AI assistant"></textarea>' +
        '<button type="submit" class="w-send" aria-label="Send message"' +
        (state.pending || state.input.trim().length === 0
          ? " disabled"
          : "") +
        '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button>' +
        "</form></div>";
    }

    var launcherStyle =
      "position:fixed;bottom:20px;" +
      (isLeft ? "left:20px" : "right:20px") +
      ";width:60px;height:60px;border-radius:50%;border:none;background:" +
      color +
      ";color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.2),0 0 0 4px " +
      lighten(color, 0.8) +
      ";display:flex;align-items:center;justify-content:center;z-index:2147483647;transition:transform 0.2s ease";

    shadow.innerHTML =
      "<style>" +
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');" +
      ":host{all:initial;font-family:Inter,system-ui,-apple-system,sans-serif}" +
      ".w-panel{position:fixed;bottom:90px;" +
      (isLeft ? "left:16px" : "right:16px") +
      ";width:min(400px,calc(100vw - 32px));height:min(580px,calc(100vh - 120px));display:flex;flex-direction:column;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.15),0 8px 20px rgba(0,0,0,0.1);border:1px solid rgba(0,0,0,0.08);background:#fff;animation:w-slide 0.25s ease-out}" +
      ".w-header{display:flex;align-items:center;gap:12px;padding:16px;color:#fff;flex-shrink:0}" +
      ".w-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}" +
      ".w-avatar img{width:100%;height:100%;object-fit:cover}" +
      ".w-header-text{min-width:0;flex:1}" +
      ".w-agent-name{font-weight:600;font-size:15px;line-height:1.3}" +
      ".w-header-sub{font-size:12px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".w-close{background:rgba(255,255,255,0.15);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
      ".w-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}" +
      ".w-input-row{display:flex;align-items:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #E5E7EB;flex-shrink:0}" +
      ".w-input{flex:1;resize:none;border-radius:10px;border:1px solid #D1D5DB;padding:8px 12px;font-size:14px;font-family:inherit;line-height:1.4;color:#111827;background:#fff;outline:none}" +
      ".w-send{width:38px;height:38px;border-radius:10px;border:none;background:" +
      color +
      ";color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
      ".w-send:disabled{background:#D1D5DB;cursor:not-allowed}" +
      ".w-suggest{font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid " +
      lighten(color, 0.6) +
      ";background:" +
      lighten(color, 0.95) +
      ";color:" +
      color +
      ";cursor:pointer;white-space:nowrap}" +
      ".w-slot{font-size:13px;padding:8px 14px;border-radius:10px;border:1.5px solid " +
      color +
      ";background:#fff;color:" +
      color +
      ";cursor:pointer;text-align:center;line-height:1.4;min-width:100px}" +
      ".w-service{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1.5px solid " +
      lighten(color, 0.4) +
      ";background:#fff;cursor:pointer;text-align:left;width:100%;transition:border-color 0.15s ease}" +
      ".w-status{display:flex;align-items:center;gap:5px;margin-top:3px}" +
      ".w-status-dot{width:7px;height:7px;border-radius:50%;background:#4ADE80;box-shadow:0 0 4px rgba(74,222,128,0.5);flex-shrink:0}" +
      ".w-date-chip{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;border-radius:10px;border:1.5px solid " +
      lighten(color, 0.4) +
      ";background:" +
      lighten(color, 0.97) +
      ";color:#374151;cursor:pointer;min-width:64px;flex-shrink:0}" +
      ".w-dots{display:inline-flex;gap:3px;align-items:center}" +
      ".w-dots span{width:6px;height:6px;border-radius:50%;background:#9CA3AF;animation:w-bounce 1.2s ease-in-out infinite}" +
      ".w-dots span:nth-child(2){animation-delay:0.15s}.w-dots span:nth-child(3){animation-delay:0.3s}" +
      "@keyframes w-slide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}" +
      "@keyframes w-bounce{0%,80%,100%{transform:translateY(0);opacity:0.4}40%{transform:translateY(-4px);opacity:1}}" +
      ".w-date-scroll::-webkit-scrollbar{display:none}" +
      "</style>" +
      panelHtml +
      '<button class="w-launcher" style="' +
      launcherStyle +
      '" aria-label="' +
      (state.isOpen ? "Close chat" : "Open chat") +
      '" aria-expanded="' +
      state.isOpen +
      '">' +
      (state.isOpen
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
        : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>') +
      "</button>";

    // ── Event listeners ──
    var launcher = shadow.querySelector(".w-launcher");
    if (launcher) {
      launcher.addEventListener("click", function () {
        state.isOpen = !state.isOpen;
        state.error = null;
        render();
      });
    }

    var closeBtn = shadow.querySelector(".w-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        state.isOpen = false;
        render();
      });
    }

    var suggestBtns = shadow.querySelectorAll(".w-suggest");
    suggestBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var msg = btn.getAttribute("data-msg");
        if (msg === "__show_date_picker") {
          state.showDatePicker = !state.showDatePicker;
          render();
        } else {
          sendMessage(msg);
        }
      });
    });

    var slotBtns = shadow.querySelectorAll(".w-slot");
    slotBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.slotChosen = true;
        sendMessage(btn.getAttribute("data-msg"));
      });
    });

    var serviceBtns = shadow.querySelectorAll(".w-service");
    serviceBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.serviceChosen = true;
        sendMessage(btn.getAttribute("data-msg"));
      });
    });

    var dateChips = shadow.querySelectorAll(".w-date-chip");
    dateChips.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var label = btn.getAttribute("data-label");
        state.showDatePicker = false;
        sendMessage("Show me available times for " + (label === "Today" ? "today" : label));
      });
    });

    var closeDateBtn = shadow.querySelector(".w-close-date");
    if (closeDateBtn) {
      closeDateBtn.addEventListener("click", function () {
        state.showDatePicker = false;
        render();
      });
    }

    var dateLeftBtn = shadow.querySelector(".w-date-left");
    if (dateLeftBtn) {
      dateLeftBtn.addEventListener("click", function () {
        var el = shadow.querySelector(".w-date-scroll");
        if (el) el.scrollBy({ left: -150, behavior: "smooth" });
      });
    }
    var dateRightBtn = shadow.querySelector(".w-date-right");
    if (dateRightBtn) {
      dateRightBtn.addEventListener("click", function () {
        var el = shadow.querySelector(".w-date-scroll");
        if (el) el.scrollBy({ left: 150, behavior: "smooth" });
      });
    }

    var form = shadow.querySelector(".w-input-row");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = shadow.querySelector(".w-input");
        if (input) {
          sendMessage(input.value);
          input.value = "";
          state.input = "";
        }
      });
    }

    var textarea = shadow.querySelector(".w-input");
    if (textarea) {
      textarea.addEventListener("input", function () {
        state.input = textarea.value;
      });
      textarea.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage(textarea.value);
          textarea.value = "";
          state.input = "";
        }
      });
      if (state.isOpen && !state.pending) {
        setTimeout(function () {
          textarea.focus();
        }, 100);
      }
    }

    // Scroll to bottom
    var msgs = shadow.querySelector(".w-messages");
    if (msgs) {
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function sendMessage(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || state.pending) return;

    state.pending = true;
    state.typing = true;
    state.error = null;
    state.messages.push({ role: "user", text: trimmed, reply: trimmed });
    render();

    // History is built from `reply`, not `text`. `text` is the short
    // deterministic caption shown beside a card, so sending it back would strip
    // the model's reasoning about what it just did — which is what makes
    // follow-ups like "move it to 3pm" work.
    var history = state.messages.map(function (msg) {
      return { role: msg.role, content: msg.reply };
    });

    fetch(baseUrl + "/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: clinicSlug,
        sessionId: state.sessionId,
        messages: history,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        state.typing = false;
        if (!result.data.ok) {
          state.error =
            result.data.error || "The assistant couldn't reply. Please try again.";
          if (result.status === 429) {
            state.messages.pop();
          }
        } else {
          // The model re-calls getServices/getAvailability on later turns even
          // though the visitor already picked from those lists. Re-rendering a
          // stale list under fresh cards makes the panel look broken, so a
          // component type is shown once and then suppressed.
          var component = result.data.component;
          if (state.serviceChosen && component && component.type === "serviceList") {
            component = undefined;
          }
          if (state.slotChosen && component && component.type === "slotList") {
            component = undefined;
          }
          // Flag only after the check above, so the first list is not swallowed.
          if (component && component.type === "serviceList") state.serviceChosen = true;
          if (component && component.type === "slotList") state.slotChosen = true;

          var isConfirmation = component && component.type === "confirmation";
          state.messages.push({
            role: "assistant",
            text: isConfirmation
              ? ""
              : component && result.data.caption
                ? result.data.caption
                : result.data.reply,
            reply: result.data.reply,
            component: component,
          });

          // After a booking, record what was booked so the assistant can act on
          // "can I move it?" or "cancel that" without asking the visitor to
          // repeat everything. Hidden from the UI, kept in the history above.
          if (result.data.sessionContext) {
            state.messages.push({
              role: "user",
              text: result.data.sessionContext,
              reply: result.data.sessionContext,
              hidden: true,
            });
            state.messages.push({
              role: "assistant",
              text: "",
              reply: "Understood. I have noted the appointment details.",
              hidden: true,
            });
          }
        }
        state.pending = false;
        render();
      })
      .catch(function () {
        state.typing = false;
        state.pending = false;
        state.error = "Network error — check your connection and try again.";
        render();
      });
  }

  // ── Public API ──
  // Lets host pages (e.g. published clinic websites) open the chat panel
  // from their own CTAs: window.MedBookWidget.open()
  window.MedBookWidget = {
    open: function () {
      // Settings still in flight: hold the request and honour it on arrival.
      // Returning quietly here is what used to send a visitor away from the
      // page they were reading.
      if (!state.settings) {
        state.openWhenReady = true;
        return;
      }
      state.isOpen = true;
      state.error = null;
      render();
    },
  };

  // ── Bootstrap ──
  // A non-`ok` response is the clinic's own master switch being off (the
  // endpoint answers 403 for unknown and deactivated clinics alike). That is a
  // deliberate "no assistant here", not a failure, so it leaves the page alone
  // rather than showing an error bubble.
  fetch(baseUrl + "/api/widget/" + encodeURIComponent(clinicSlug) + "/settings")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) return;
      state.settings = data;
      if (state.openWhenReady) {
        state.openWhenReady = false;
        state.isOpen = true;
      }
      render();
    })
    .catch(function () {
      // Never let a failed settings fetch throw out of the widget — the host
      // page keeps working, it just has no assistant.
    });
})();
