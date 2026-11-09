/** Build an inert mail document in a template, which does not load its resources. */
export function emailContentId(value: string): string {
  let id = value.replace(/^cid:/i, "");
  try {
    id = decodeURIComponent(id);
  } catch {}
  return id.replace(/^<|>$/g, "").trim();
}

export function createEmailDocument(
  html: string,
  options: {
    remoteImages: boolean;
    inlineImages: Readonly<Record<string, string>>;
  },
): { document: string; contentIds: string[] } {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set(
    "a p div span table td th tr thead tbody tfoot caption col colgroup br hr img ul ol li dl dt dd strong b em i u s strike small big blockquote pre code h1 h2 h3 h4 h5 h6 center font style sup sub address figure figcaption wbr".split(
      " ",
    ),
  );
  const discard = new Set(
    "script noscript title iframe frame frameset object embed template svg math form input button select textarea meta base link audio video source track canvas".split(
      " ",
    ),
  );
  const attrs = new Set(
    "style class id title alt width height align valign bgcolor color face size border cellpadding cellspacing colspan rowspan role aria-label dir lang start type".split(
      " ",
    ),
  );
  const contentIds = new Set<string>();
  const url = (value: string, protocols: string[]) => {
    try {
      const parsed = new URL(value);
      return protocols.includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
        ? parsed.href
        : null;
    } catch {
      return null;
    }
  };
  for (const el of template.content.querySelectorAll("*")) {
    const tag = el.localName;
    if (discard.has(tag)) {
      el.remove();
      continue;
    }
    if (!allowed.has(tag)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    const src = el.getAttribute("src"),
      href = el.getAttribute("href"),
      background = el.getAttribute("background");
    for (const attr of [...el.attributes])
      if (!attrs.has(attr.name)) el.removeAttribute(attr.name);
    if (tag === "a" && href) {
      const safe = url(href, ["https:", "http:", "mailto:"]);
      if (safe) {
        el.setAttribute("href", safe);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (tag === "img" && src) {
      let safe: string | null = null;
      if (/^cid:/i.test(src)) {
        const id = emailContentId(src);
        contentIds.add(id);
        safe = url(options.inlineImages[id] ?? "", ["https:"]);
      } else if (
        /^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(
          src,
        )
      ) {
        safe = src;
      } else if (options.remoteImages) {
        safe = url(src.startsWith("//") ? "https:" + src : src, ["https:"]);
      }
      if (safe) el.setAttribute("src", safe);
      else if (!el.hasAttribute("alt"))
        el.setAttribute("alt", "Image not loaded");
      el.setAttribute("referrerpolicy", "no-referrer");
      el.setAttribute("decoding", "async");
    }
    if (background && options.remoteImages) {
      const safe = url(background, ["https:"]);
      if (safe) el.setAttribute("background", safe);
    }
  }
  // Inline CSS may style mail, but cannot fetch fonts/styles or run active content.
  // Only explicit image consent permits HTTPS image and CSS background requests.
  const origins = options.remoteImages
    ? "https:"
    : [
        ...new Set(
          Object.values(options.inlineImages).flatMap((value) => {
            const safe = url(value, ["https:"]);
            return safe ? [new URL(safe).origin] : [];
          }),
        ),
      ].join(" ");
  const csp = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: ${origins}; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'`;
  return {
    document:
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="' +
      csp +
      '"><style>html{color-scheme:light;background:#fff;color:#202124}body{margin:0;padding:16px;font:16px/1.55 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%!important;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{overflow-wrap:anywhere}@media(max-width:600px){body{padding:10px}table[width]{width:100%!important}}</style></head><body>' +
      template.innerHTML +
      "</body></html>",
    contentIds: [...contentIds],
  };
}
