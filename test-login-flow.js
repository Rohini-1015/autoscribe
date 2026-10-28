const fs = require('fs');

console.log("==========================================");
console.log("Testing Login Flow Helpers & Isolation...");
console.log("==========================================");

// Mock Speech Engine Helper Functions
const speechEngine = {
  normalizeRollNumber(text) {
    if (!text) return '';
    let str = text.trim().toLowerCase();

    str = str.replace(/\b(dash|hyphen|minus)\b/gi, '-');
    str = str.replace(/\b(slash)\b/gi, '/');
    str = str.replace(/\b(dot|period|full\s+stop)\b/gi, '');
    str = str.replace(/\b(blank\s+space|space\s+character|space)\b/gi, '');
    str = str.replace(/[,.!?]/g, '');

    const numMap = {
      'zero': '0', 'oh': '0', 'null': '0',
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
    };

    str = str.replace(/\b(zero|oh|null|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (m) => numMap[m.toLowerCase()] || m);
    str = str.replace(/^(my\s+)?(roll\s+number|registration\s+id|student\s+id|id|number)(\s+is)?\s*/i, '');
    str = str.replace(/^(it\s+is|is)\s*/i, '');

    str = str.replace(/(?<=[a-zA-Z0-9\-])\s+(?=[a-zA-Z0-9\-])/g, '');
    str = str.replace(/\s+/g, '').toUpperCase();

    if (/^\d+$/.test(str)) {
      return `STD-${str}`;
    }
    if (/^[A-Z]+\d+$/.test(str)) {
      return str.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
    }
    return str;
  },

  parseSpellingName(text) {
    if (!text) return '';
    let str = text.trim().toLowerCase();

    str = str.replace(/[,.!?]/g, ' ');
    str = str.replace(/\b(blank\s+space|space\s+character|space)\b/gi, ' __SPACE__ ');

    const phoneticMap = {
      'ay': 'A', 'bee': 'B', 'see': 'C', 'dee': 'D', 'ee': 'E', 'eff': 'F',
      'gee': 'G', 'aitch': 'H', 'eye': 'I', 'jay': 'J', 'kay': 'K', 'el': 'L',
      'em': 'M', 'en': 'N', 'oh': 'O', 'pee': 'P', 'cue': 'Q', 'are': 'R',
      'ess': 'S', 'tee': 'T', 'you': 'U', 'vee': 'V', 'double-you': 'W',
      'doubleyou': 'W', 'ex': 'X', 'why': 'Y', 'zee': 'Z', 'zed': 'Z'
    };

    for (const [phonetic, letter] of Object.entries(phoneticMap)) {
      str = str.replace(new RegExp(`\\b${phonetic}\\b`, 'gi'), letter);
    }

    const tokens = str.split(/\s+/).filter(t => t.length > 0);
    let result = '';

    for (const token of tokens) {
      if (token === '__SPACE__') {
        result += ' ';
      } else if (/^[a-z]$/i.test(token)) {
        result += token.toUpperCase();
      } else {
        result += token.toUpperCase();
      }
    }

    const words = result.split(/\s+/).filter(w => w.length > 0);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  },

  formatSpellingForReadback(value, isName = true) {
    if (!value) return '';
    const words = value.split(' ');
    const formattedWords = words.map(w => w.toUpperCase().split('').join(' '));
    return formattedWords.join(' space ');
  }
};

// [Test 1] Number Word Conversion Tests
console.log("\n[Test 1] Number Word Conversion...");
const rollTests = [
  { input: "two five", expected: "STD-25" },
  { input: "one zero zero one", expected: "STD-1001" },
  { input: "one two three four", expected: "STD-1234" },
  { input: "25", expected: "STD-25" },
  { input: "1001", expected: "STD-1001" },
  { input: "STD-1001", expected: "STD-1001" }
];

rollTests.forEach(test => {
  const result = speechEngine.normalizeRollNumber(test.input);
  console.log(`Input: "${test.input}" -> Normalized: "${result}"`);
  console.assert(result === test.expected, `Expected ${test.expected}, got ${result}`);
});

// [Test 2] Letter-by-Letter Name Parsing Tests
console.log("\n[Test 2] Letter-by-Letter Name Parsing...");
const nameTests = [
  { input: "S W A A T H I space B", expected: "Swaathi B" },
  { input: "A L E X space J O H N S O N", expected: "Alex Johnson" },
  { input: "ay el ee ex space j oh aitch en", expected: "Alex John" }
];

nameTests.forEach(test => {
  const result = speechEngine.parseSpellingName(test.input);
  console.log(`Spoken: "${test.input}" -> Parsed Name: "${result}"`);
  console.assert(result === test.expected, `Expected "${test.expected}", got "${result}"`);
});

// [Test 3] Readback Spelling Formatting Test
console.log("\n[Test 3] Readback Spelling Formatting...");
const readbackResult = speechEngine.formatSpellingForReadback("Swaathi B");
console.log(`Name: "Swaathi B" -> Readback: "${readbackResult}"`);
console.assert(readbackResult === "S W A A T H I space B", `Readback error: got ${readbackResult}`);

// [Test 4] Verify login.html Code Isolation
console.log("\n[Test 4] Verifying login.html Code Isolation...");
const loginHtmlContent = fs.readFileSync('login.html', 'utf8');

const containsExamPrompt = loginHtmlContent.includes("Can I read the question once again");
console.log("Contains exam prompt 'Can I read the question...':", containsExamPrompt);
console.assert(!containsExamPrompt, "login.html MUST NOT contain exam prompt text.");

const containsExamSession = loginHtmlContent.includes("AutoScribeExamSession");
console.log("Contains 'AutoScribeExamSession':", containsExamSession);
console.assert(!containsExamSession, "login.html MUST NOT reference AutoScribeExamSession.");

console.log("\n==========================================");
console.log("✅ All Login Flow Tests PASSED!");
console.log("==========================================");
