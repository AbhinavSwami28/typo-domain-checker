// Keyboard adjacency map for QWERTY layout
const KEYBOARD_ADJACENT = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "erfcxs", e: "rdsw",
  f: "rtgvcd", g: "tyhbvf", h: "yujnbg", i: "uojk", j: "uiknmh",
  k: "iolmj", l: "opk", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "wa", r: "etfd", s: "wedxza", t: "rygf",
  u: "yihj", v: "cfgb", w: "qase", x: "zsdc", y: "tugh", z: "asx",
};

// Common homoglyph substitutions (including internationalized chars)
const HOMOGLYPHS = {
  a: ["4", "@", "à", "á", "â", "ã", "ä"],
  b: ["d", "6"],
  c: ["k", "ç"],
  d: ["b", "cl"],
  e: ["3", "è", "é", "ê", "ë"],
  g: ["9", "q"],
  h: ["lh"],
  i: ["1", "l", "!", "ì", "í", "î", "ï"],
  k: ["lk"],
  l: ["1", "i", "|"],
  m: ["rn", "nn"],
  n: ["m", "ñ"],
  o: ["0", "ò", "ó", "ô", "õ", "ö"],
  p: ["q"],
  q: ["p", "g"],
  r: ["v"],
  s: ["5", "$", "ş"],
  t: ["7"],
  u: ["v", "ù", "ú", "û", "ü"],
  v: ["u"],
  w: ["vv", "uu"],
  y: ["ÿ"],
  z: ["2"],
};

const COMMON_TLDS = [
  "com", "net", "org", "io", "co", "info", "biz", "xyz",
  "dev", "app", "site", "online", "tech", "store", "cloud",
];

const CC_TLDS = [
  "co.uk", "com.au", "co.in", "co.jp", "com.br", "co.za",
  "com.mx", "co.nz", "com.sg", "com.hk",
];

// Bitsquatting: for each character, flip one bit at a time and keep if
// the result is a valid domain character (a-z, 0-9, hyphen).
function bitsquatVariants(char) {
  const code = char.charCodeAt(0);
  const variants = [];
  for (let bit = 0; bit < 8; bit++) {
    const flipped = code ^ (1 << bit);
    if (flipped === code) continue;
    const ch = String.fromCharCode(flipped);
    if (/[a-z0-9-]/.test(ch) && ch !== char) {
      variants.push(ch);
    }
  }
  return variants;
}

const COMMON_PREFIXES = [
  "www", "my", "the", "login", "mail", "secure", "account",
  "info", "help", "support",
];

const COMMON_SUFFIXES = [
  "online", "web", "site", "app", "login", "secure", "mail",
  "group", "inc", "corp", "global",
];

// QWERTZ (German) keyboard layout — different adjacent keys for y/z and others
const KEYBOARD_QWERTZ = {
  a: "qwsy", b: "vghn", c: "xdfv", d: "erfcxs", e: "rdsw",
  f: "rtgvcd", g: "tzhbvf", h: "zujnbg", i: "uojk", j: "uiknmh",
  k: "iolmj", l: "opk", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "wa", r: "etfd", s: "wedxya", t: "rzgf",
  u: "zihj", v: "cfgb", w: "qase", x: "ysdc", y: "asx",  // y is next to a on QWERTZ
  z: "tuhg",  // z is where y is on QWERTY
};

// AZERTY (French) keyboard layout
const KEYBOARD_AZERTY = {
  a: "qzws", b: "vghn", c: "xdfv", d: "erfcxs", e: "rdsz",
  f: "rtgvcd", g: "tyhbvf", h: "yujnbg", i: "uojk", j: "uiknmh",
  k: "iolmj", l: "opk", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "azw", r: "etfd", s: "edxwz", t: "rygf",
  u: "yihj", v: "cfgb", w: "qsxz", x: "wsdc", y: "tugh", z: "aqse",
};

// Cyrillic lookalikes for Latin characters (used for IDN homograph attacks)
const LATIN_TO_CYRILLIC = {
  a: "а", c: "с", d: "ԁ", e: "е", h: "һ", i: "і",
  j: "ј", k: "к", l: "ӏ", o: "о", p: "р", s: "ѕ",
  t: "т", u: "ц", w: "ԝ", x: "х", y: "у",
};

// Common English homophones — words that sound the same but are spelled differently
const HOMOPHONES = {
  air: ["ere", "heir"], bare: ["bear"], buy: ["by", "bye"],
  cell: ["sell"], cent: ["sent", "scent"], dear: ["deer"],
  fair: ["fare"], for: ["four", "fore"], hear: ["here"],
  hole: ["whole"], hour: ["our"], know: ["no"],
  mail: ["male"], meat: ["meet"], new: ["knew", "gnu"],
  night: ["knight"], one: ["won"], pair: ["pare", "pear"],
  peace: ["piece"], plain: ["plane"], read: ["red", "reed"],
  right: ["rite", "write"], road: ["rode"], role: ["roll"],
  sail: ["sale"], sea: ["see"], sight: ["site", "cite"],
  sole: ["soul"], some: ["sum"], son: ["sun"],
  stake: ["steak"], steal: ["steel"], tail: ["tale"],
  their: ["there", "they're".replace("'", "")], to: ["too", "two"],
  wait: ["weight"], war: ["wore"], way: ["weigh"],
  weak: ["week"], wear: ["where"], which: ["witch"],
  wood: ["would"],
};

// Common misspelling patterns (substring replacements)
const COMMON_MISSPELLINGS = [
  ["tion", "sion"], ["sion", "tion"], ["ance", "ence"], ["ence", "ance"],
  ["able", "ible"], ["ible", "able"], ["ment", "mant"], ["ant", "ent"],
  ["ent", "ant"], ["ary", "ery"], ["ery", "ary"], ["ful", "full"],
  ["full", "ful"], ["ness", "nes"], ["ally", "aly"], ["ely", "ly"],
  ["ght", "gt"], ["ph", "f"], ["f", "ph"], ["ck", "k"], ["k", "ck"],
  ["oo", "u"], ["ee", "ea"], ["ea", "ee"], ["ie", "ei"], ["ei", "ie"],
  ["ou", "ow"], ["ow", "ou"], ["th", "t"], ["sh", "s"],
  ["sch", "sh"], ["sh", "sch"],
];

// Numeral swap: digit ↔ word/ordinal mappings (from CIRCL's ail-typo-squatting)
const NUMERAL_GROUPS = [
  ["0", "zero"],
  ["1", "one", "first"],
  ["2", "two", "second"],
  ["3", "three", "third"],
  ["4", "four", "fourth", "for"],
  ["5", "five", "fifth"],
  ["6", "six", "sixth"],
  ["7", "seven", "seventh"],
  ["8", "eight", "eighth"],
  ["9", "nine", "ninth"],
];

// Common dynamic DNS provider suffixes (curated from MISP warninglists)
const DDNS_SUFFIXES = [
  "dyndns.org", "duckdns.org", "no-ip.com", "no-ip.org",
  "dynu.com", "hopto.org", "zapto.org", "sytes.net",
  "ddns.net", "serveftp.com", "servehttp.com",
  "freedns.afraid.org", "changeip.co", "myftp.biz",
  "myftp.org", "servebeer.com", "webhop.me",
];

// Known SLDs (second-level domains) grouped by country TLD
const SLDS_BY_COUNTRY = {
  uk: ["co.uk", "org.uk", "me.uk", "net.uk", "ac.uk", "gov.uk", "sch.uk"],
  au: ["com.au", "net.au", "org.au", "edu.au", "id.au"],
  nz: ["co.nz", "net.nz", "org.nz", "ac.nz"],
  za: ["co.za", "org.za", "net.za", "ac.za", "web.za"],
  in: ["co.in", "net.in", "org.in", "ac.in", "gen.in"],
  jp: ["co.jp", "or.jp", "ne.jp", "ac.jp"],
  br: ["com.br", "net.br", "org.br"],
  mx: ["com.mx", "net.mx", "org.mx"],
  hk: ["com.hk", "org.hk", "net.hk", "edu.hk"],
  sg: ["com.sg", "net.sg", "org.sg", "edu.sg"],
  kr: ["co.kr", "or.kr", "ne.kr"],
  tw: ["com.tw", "net.tw", "org.tw"],
};

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
const MAX_NAME_LENGTH = 40;

export function validateDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return { valid: false, error: "Domain is required" };
  }
  const d = domain.trim().toLowerCase();
  if (!d.includes(".")) {
    return { valid: false, error: "Domain must include a TLD (e.g. example.com)" };
  }
  if (d.length > 253) {
    return { valid: false, error: "Domain exceeds maximum length (253 chars)" };
  }
  const name = d.split(".")[0];
  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Domain name too long (max ${MAX_NAME_LENGTH} chars) to generate typos efficiently` };
  }
  if (!DOMAIN_REGEX.test(d)) {
    return { valid: false, error: "Invalid domain format. Use alphanumeric characters and hyphens only." };
  }
  return { valid: true, domain: d };
}

export function generateTypoDomains(domain) {
  const dotIndex = domain.indexOf(".");
  if (dotIndex === -1) return [];

  const name = domain.substring(0, dotIndex);
  const tld = domain.substring(dotIndex + 1);
  const results = new Map();

  function add(variant, type) {
    const d = variant.toLowerCase();
    if (d === domain.toLowerCase()) return;
    const namePart = d.substring(0, d.indexOf("."));
    if (!namePart || namePart.length < 1) return;
    if (!results.has(d)) {
      results.set(d, { domain: d, type });
    }
  }

  // 1. Character omission
  for (let i = 0; i < name.length; i++) {
    const v = name.slice(0, i) + name.slice(i + 1);
    if (v.length > 0) add(v + "." + tld, "Omission");
  }

  // 2. Adjacent character swap (transposition)
  for (let i = 0; i < name.length - 1; i++) {
    const chars = name.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    add(chars.join("") + "." + tld, "Transposition");
  }

  // 3. Adjacent key replacement
  for (let i = 0; i < name.length; i++) {
    const adjacents = KEYBOARD_ADJACENT[name[i].toLowerCase()];
    if (adjacents) {
      for (const adj of adjacents) {
        add(name.slice(0, i) + adj + name.slice(i + 1) + "." + tld, "Adjacent Key");
      }
    }
  }

  // 4. Character duplication
  for (let i = 0; i < name.length; i++) {
    add(name.slice(0, i) + name[i] + name[i] + name.slice(i + 1) + "." + tld, "Duplication");
  }

  // 5. Character insertion
  for (let i = 0; i <= name.length; i++) {
    for (let c = 97; c <= 122; c++) {
      add(name.slice(0, i) + String.fromCharCode(c) + name.slice(i) + "." + tld, "Insertion");
    }
  }

  // 6. Homoglyph substitution
  for (let i = 0; i < name.length; i++) {
    const glyphs = HOMOGLYPHS[name[i].toLowerCase()];
    if (glyphs) {
      for (const g of glyphs) {
        add(name.slice(0, i) + g + name.slice(i + 1) + "." + tld, "Homoglyph");
      }
    }
  }

  // 7. TLD swap
  for (const altTld of COMMON_TLDS) {
    if (altTld !== tld.toLowerCase()) add(name + "." + altTld, "TLD Swap");
  }

  // 8. Dot insertion
  for (let i = 1; i < name.length; i++) {
    add(name.slice(0, i) + "." + name.slice(i) + "." + tld, "Dot Insertion");
  }

  // 9. Hyphen insertion
  for (let i = 1; i < name.length; i++) {
    add(name.slice(0, i) + "-" + name.slice(i) + "." + tld, "Hyphen Insertion");
  }

  // 10. Vowel swap
  const vowels = "aeiou";
  for (let i = 0; i < name.length; i++) {
    if (vowels.includes(name[i].toLowerCase())) {
      for (const v of vowels) {
        if (v !== name[i].toLowerCase()) {
          add(name.slice(0, i) + v + name.slice(i + 1) + "." + tld, "Vowel Swap");
        }
      }
    }
  }

  // 11. Bitsquatting — flip single bits in each character
  for (let i = 0; i < name.length; i++) {
    for (const v of bitsquatVariants(name[i].toLowerCase())) {
      add(name.slice(0, i) + v + name.slice(i + 1) + "." + tld, "Bitsquatting");
    }
  }

  // 12. Word swap — for hyphenated domains, swap the parts
  if (name.includes("-")) {
    const parts = name.split("-");
    if (parts.length === 2) {
      add(parts[1] + "-" + parts[0] + "." + tld, "Word Swap");
    }
    // For 3+ parts, generate all rotations
    if (parts.length >= 3) {
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const swapped = [...parts];
          [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
          add(swapped.join("-") + "." + tld, "Word Swap");
        }
      }
    }
  }

  // 13. Whole-word omission — for compound domains (hyphenated or camelCase)
  if (name.includes("-")) {
    const parts = name.split("-");
    for (let i = 0; i < parts.length; i++) {
      const remaining = parts.filter((_, idx) => idx !== i);
      if (remaining.length > 0 && remaining.join("-").length > 0) {
        add(remaining.join("-") + "." + tld, "Word Omission");
      }
      // Also without the hyphen
      if (remaining.length > 1) {
        add(remaining.join("") + "." + tld, "Word Omission");
      }
    }
  }

  // 14. Hyphen omission — remove hyphens from hyphenated domains
  if (name.includes("-")) {
    add(name.replace(/-/g, "") + "." + tld, "Hyphen Omission");
    // Also remove individual hyphens one at a time
    for (let i = 0; i < name.length; i++) {
      if (name[i] === "-") {
        add(name.slice(0, i) + name.slice(i + 1) + "." + tld, "Hyphen Omission");
      }
    }
  }

  // 15. WWW prefix without dot — common typo for users typing URLs
  add("www" + name + "." + tld, "WWW Prefix");

  // 16. Common prefix/suffix — brand impersonation patterns
  for (const prefix of COMMON_PREFIXES) {
    add(prefix + "-" + name + "." + tld, "Prefix Addition");
    add(prefix + name + "." + tld, "Prefix Addition");
  }
  for (const suffix of COMMON_SUFFIXES) {
    add(name + "-" + suffix + "." + tld, "Suffix Addition");
    add(name + suffix + "." + tld, "Suffix Addition");
  }

  // 17. ccTLD variants — country-code TLD variants
  for (const ccTld of CC_TLDS) {
    add(name + "." + ccTld, "ccTLD Variant");
  }

  // 18. Plural / Singularization
  if (name.endsWith("s") && name.length > 2) {
    // Remove trailing 's' (singularize)
    add(name.slice(0, -1) + "." + tld, "Singular/Plural");
    // Remove 'es' if applicable
    if (name.endsWith("es") && name.length > 3) {
      add(name.slice(0, -2) + "." + tld, "Singular/Plural");
    }
    // Remove 'ies' -> 'y'
    if (name.endsWith("ies") && name.length > 4) {
      add(name.slice(0, -3) + "y." + tld, "Singular/Plural");
    }
  } else {
    // Pluralize
    add(name + "s." + tld, "Singular/Plural");
    add(name + "es." + tld, "Singular/Plural");
  }
  // Also pluralize/singularize individual words in hyphenated domains
  if (name.includes("-")) {
    const parts = name.split("-");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.endsWith("s") && p.length > 2) {
        const singular = [...parts];
        singular[i] = p.slice(0, -1);
        add(singular.join("-") + "." + tld, "Singular/Plural");
      } else if (p.length > 1) {
        const plural = [...parts];
        plural[i] = p + "s";
        add(plural.join("-") + "." + tld, "Singular/Plural");
      }
    }
  }

  // 19. Numeric addition — append digits 0-9 to end of domain name
  for (let d = 0; d <= 9; d++) {
    add(name + d + "." + tld, "Numeric Addition");
  }
  // Also common numeric patterns
  for (const n of ["1", "2", "123", "01", "247", "360", "365"]) {
    add(name + n + "." + tld, "Numeric Addition");
    add(name + "-" + n + "." + tld, "Numeric Addition");
  }

  // 20. QWERTZ adjacent key replacement (German keyboard layout)
  for (let i = 0; i < name.length; i++) {
    const adjacents = KEYBOARD_QWERTZ[name[i].toLowerCase()];
    if (adjacents) {
      for (const adj of adjacents) {
        add(name.slice(0, i) + adj + name.slice(i + 1) + "." + tld, "Adjacent Key (QWERTZ)");
      }
    }
  }

  // 21. AZERTY adjacent key replacement (French keyboard layout)
  for (let i = 0; i < name.length; i++) {
    const adjacents = KEYBOARD_AZERTY[name[i].toLowerCase()];
    if (adjacents) {
      for (const adj of adjacents) {
        add(name.slice(0, i) + adj + name.slice(i + 1) + "." + tld, "Adjacent Key (AZERTY)");
      }
    }
  }

  // 22. Cyrillic/IDN homograph — replace ALL possible Latin chars with Cyrillic
  //     to create a domain that looks identical in browsers (punycode-encoded).
  {
    let cyrillic = "";
    let allMapped = true;
    for (const ch of name) {
      if (ch === "-" || /[0-9]/.test(ch)) {
        cyrillic += ch;
      } else if (LATIN_TO_CYRILLIC[ch.toLowerCase()]) {
        cyrillic += LATIN_TO_CYRILLIC[ch.toLowerCase()];
      } else {
        allMapped = false;
        cyrillic += ch;
      }
    }
    // Full Cyrillic replacement (most dangerous — visually identical)
    if (allMapped && cyrillic !== name) {
      add(cyrillic + "." + tld, "Cyrillic IDN");
    }
    // Also individual Cyrillic char substitutions (mixed script — still registerable on some TLDs)
    for (let i = 0; i < name.length; i++) {
      const cyr = LATIN_TO_CYRILLIC[name[i].toLowerCase()];
      if (cyr) {
        add(name.slice(0, i) + cyr + name.slice(i + 1) + "." + tld, "Cyrillic IDN");
      }
    }
  }

  // 23. Homophones — replace words/substrings with sound-alikes
  //     Check in the full name and also in each hyphen-separated part
  {
    const parts = name.includes("-") ? [name, ...name.split("-")] : [name];
    for (const part of parts) {
      for (const [word, alts] of Object.entries(HOMOPHONES)) {
        let searchFrom = 0;
        while (true) {
          const idx = part.indexOf(word, searchFrom);
          if (idx === -1) break;
          for (const alt of alts) {
            if (part === name) {
              add(name.slice(0, idx) + alt + name.slice(idx + word.length) + "." + tld, "Homophone");
            } else {
              // Replace in the specific part, reconstruct with hyphens
              const newPart = part.slice(0, idx) + alt + part.slice(idx + word.length);
              add(name.replace(part, newPart) + "." + tld, "Homophone");
            }
          }
          searchFrom = idx + 1;
        }
      }
    }
  }

  // 24. Common misspelling patterns — substring replacements (find all occurrences)
  for (const [from, to] of COMMON_MISSPELLINGS) {
    let searchFrom = 0;
    while (true) {
      const idx = name.indexOf(from, searchFrom);
      if (idx === -1) break;
      add(name.slice(0, idx) + to + name.slice(idx + from.length) + "." + tld, "Misspelling");
      searchFrom = idx + 1;
    }
  }

  // 25. Double homoglyph — two simultaneous homoglyph substitutions
  //     (capped to avoid combinatorial explosion)
  {
    const positions = [];
    for (let i = 0; i < name.length; i++) {
      if (HOMOGLYPHS[name[i].toLowerCase()]) {
        positions.push(i);
      }
    }
    // Only generate if 2+ positions and cap total output
    if (positions.length >= 2 && positions.length <= 20) {
      let count = 0;
      const MAX_DOUBLE = 50;
      outer:
      for (let a = 0; a < positions.length && count < MAX_DOUBLE; a++) {
        for (let b = a + 1; b < positions.length && count < MAX_DOUBLE; b++) {
          const i = positions[a];
          const j = positions[b];
          const glyphs1 = HOMOGLYPHS[name[i].toLowerCase()];
          const glyphs2 = HOMOGLYPHS[name[j].toLowerCase()];
          // Use first glyph of each to keep count manageable
          const variant = name.slice(0, i) + glyphs1[0] +
            name.slice(i + 1, j) + glyphs2[0] + name.slice(j + 1);
          add(variant + "." + tld, "Double Homoglyph");
          count++;
        }
      }
    }
  }

  // 26. Double character omission — remove two characters at once (common in fast typing)
  //     Only for names >= 5 chars to avoid generating too-short variants
  if (name.length >= 5) {
    for (let i = 0; i < name.length; i++) {
      for (let j = i + 1; j < name.length; j++) {
        // Skip removing hyphens (already handled by hyphen omission)
        if (name[i] === "-" || name[j] === "-") continue;
        const v = name.slice(0, i) + name.slice(i + 1, j) + name.slice(j + 1);
        if (v.length > 0) add(v + "." + tld, "Double Omission");
      }
    }
  }

  // 27. Vowel omission — remove multiple vowels at once
  //     People often skip vowels when typing quickly (e.g. "ntflx" for "netflix")
  {
    const vowelPositions = [];
    for (let i = 0; i < name.length; i++) {
      if ("aeiou".includes(name[i].toLowerCase())) {
        vowelPositions.push(i);
      }
    }

    if (vowelPositions.length >= 2) {
      // Remove all vowels at once
      let allRemoved = name;
      for (let i = vowelPositions.length - 1; i >= 0; i--) {
        const p = vowelPositions[i];
        allRemoved = allRemoved.slice(0, p) + allRemoved.slice(p + 1);
      }
      if (allRemoved.length > 0) add(allRemoved + "." + tld, "Vowel Omission");

      // Remove pairs of vowels
      for (let i = 0; i < vowelPositions.length; i++) {
        for (let j = i + 1; j < vowelPositions.length; j++) {
          const pi = vowelPositions[i];
          const pj = vowelPositions[j];
          const v = name.slice(0, pi) + name.slice(pi + 1, pj) + name.slice(pj + 1);
          if (v.length > 0) add(v + "." + tld, "Vowel Omission");
        }
      }

      // Remove triplets of vowels (for longer names with 4+ vowels)
      if (vowelPositions.length >= 4) {
        for (let i = 0; i < vowelPositions.length; i++) {
          for (let j = i + 1; j < vowelPositions.length; j++) {
            for (let k = j + 1; k < vowelPositions.length; k++) {
              const pi = vowelPositions[i];
              const pj = vowelPositions[j];
              const pk = vowelPositions[k];
              const v = name.slice(0, pi) + name.slice(pi + 1, pj) +
                name.slice(pj + 1, pk) + name.slice(pk + 1);
              if (v.length > 0) add(v + "." + tld, "Vowel Omission");
            }
          }
        }
      }
    }
  }

  // 28. Numeral swap — digit ↔ word/ordinal (e.g., 4sale ↔ forsale, go2 ↔ gotwo)
  for (const group of NUMERAL_GROUPS) {
    for (const from of group) {
      let searchFrom = 0;
      while (true) {
        const idx = name.indexOf(from, searchFrom);
        if (idx === -1) break;
        for (const to of group) {
          if (to === from) continue;
          add(name.slice(0, idx) + to + name.slice(idx + from.length) + "." + tld, "Numeral Swap");
        }
        searchFrom = idx + 1;
      }
    }
  }

  // 29. Add TLD — stack a new TLD after the existing full domain
  //     e.g., example.com → example.com.org (attacker registers com.org subdomain)
  for (const altTld of ["com", "net", "org", "io", "info", "xyz", "online", "site"]) {
    if (altTld !== tld.toLowerCase()) {
      add(name + "." + tld + "." + altTld, "Add TLD");
    }
  }

  // 30. Change dot to dash — replace dots with dashes in the full domain
  //     e.g., sub.example.com → sub-example.com
  {
    const fullParts = domain.split(".");
    if (fullParts.length >= 2) {
      // Replace each dot (except the last one before TLD) with a dash
      for (let i = 0; i < fullParts.length - 1; i++) {
        const before = fullParts.slice(0, i + 1).join(".");
        const after = fullParts.slice(i + 1).join(".");
        const dashed = fullParts.slice(0, i + 1).join("-");
        // Merge with remaining parts
        if (i < fullParts.length - 2) {
          add(dashed + "." + fullParts.slice(i + 1).join("."), "Dot to Dash");
        }
      }
      // Replace ALL dots with dashes, then add common TLDs
      const allDashed = fullParts.join("-");
      for (const altTld of ["com", "net", "org"]) {
        add(allDashed + "." + altTld, "Dot to Dash");
      }
    }
  }

  // 31. Missing dot (enhanced) — remove dots to merge with adjacent parts
  //     e.g., www.example.com → wwwexample.com, example.com → examplecom.net
  {
    const fullParts = domain.split(".");
    if (fullParts.length >= 2) {
      // Remove each dot one at a time, left to right
      for (let i = 0; i < fullParts.length - 1; i++) {
        const merged = [...fullParts];
        merged[i] = merged[i] + merged[i + 1];
        merged.splice(i + 1, 1);
        if (merged.length >= 2) {
          add(merged.join("."), "Missing Dot");
        } else {
          // All dots removed — append common TLDs
          for (const altTld of ["com", "net", "org"]) {
            add(merged[0] + "." + altTld, "Missing Dot");
          }
        }
      }
      // Also with www. prefix
      const wwwParts = ["www", ...fullParts];
      for (let i = 0; i < wwwParts.length - 1; i++) {
        const merged = [...wwwParts];
        merged[i] = merged[i] + merged[i + 1];
        merged.splice(i + 1, 1);
        if (merged.length >= 2) {
          add(merged.join("."), "Missing Dot");
        }
      }
    }
  }

  // 32. Double replacement — replace 2 consecutive characters with identical pairs
  //     e.g., google → gggle, netflix → nnflix (simulates double-tap typo)
  for (let i = 0; i < name.length - 1; i++) {
    // Skip hyphens
    if (name[i] === "-" || name[i + 1] === "-") continue;
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      const v = name.slice(0, i) + ch + ch + name.slice(i + 2);
      if (v !== name) add(v + "." + tld, "Double Replacement");
    }
    for (let d = 48; d <= 57; d++) {
      const ch = String.fromCharCode(d);
      const v = name.slice(0, i) + ch + ch + name.slice(i + 2);
      if (v !== name) add(v + "." + tld, "Double Replacement");
    }
  }

  // 33. Wrong SLD — for compound TLDs, try other SLDs for the same country
  //     e.g., example.co.uk → example.org.uk, example.me.uk
  {
    for (const [country, slds] of Object.entries(SLDS_BY_COUNTRY)) {
      for (const sld of slds) {
        if (domain.endsWith("." + sld)) {
          // Found a matching compound TLD — generate variants with other SLDs
          const baseName = domain.slice(0, domain.length - sld.length - 1);
          for (const altSld of slds) {
            if (altSld !== sld) {
              add(baseName + "." + altSld, "Wrong SLD");
            }
          }
          break;
        }
      }
    }
  }

  // 34. Dynamic DNS — append DDNS provider suffixes
  //     e.g., netflix → netflix.dyndns.org, netflix.duckdns.org
  {
    const baseName = name.replace(/[.-]/g, "-");
    for (const ddns of DDNS_SUFFIXES) {
      add(baseName + "." + ddns, "Dynamic DNS");
      add(name + "." + ddns, "Dynamic DNS");
    }
  }

  return Array.from(results.values());
}
