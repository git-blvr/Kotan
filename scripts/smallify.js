const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

// smallify — converts text to Unicode small caps.
//
//   node scripts/smallify.js "Hello World"     → Hᴇʟʟᴏ Wᴏʀʟᴅ
//   smallify / npm run smallify / npm run s    → REPL: converts each line until Ctrl+C
//   echo "hello" | node scripts/smallify.js    → ʜᴇʟʟᴏ
//
// Flags: --all (every letter becomes small caps, no capitals kept),
//        --copy (copies the result to the Windows clipboard via clip).

const SMALL = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

function smallify(text, { all = false } = {}) {
    return [...text].map((ch) => {
        const lower = ch.toLowerCase();
        if (SMALL[lower] && (all || ch === lower || ch !== ch.toUpperCase())) return SMALL[lower];
        if (SMALL[lower] && ch === ch.toUpperCase()) return all ? SMALL[lower] : ch; // keep capitals
        return ch;
    }).join('');
}

function parseArgs(argv) {
    const words = [];
    const out = { all: false, copy: false, words };
    for (const a of argv) {
        if (a === '--all') out.all = true;
        else if (a === '--copy') out.copy = true;
        else words.push(a.replace(/^--(?=[a-z])/i, '')); // tolerate --word from npm forwarding
    }
    return out;
}

const args = parseArgs(process.argv.slice(2));

function emit(text) {
    const out = smallify(text, args);
    console.log(out);
    if (args.copy && process.platform === 'win32') {
        const r = spawnSync('clip', { input: out });
        if (!r.error) console.log('(copied to clipboard)');
    }
    process.exitCode = 0;
}

if (args.words.length) {
    emit(args.words.join(' '));
} else if (!process.stdin.isTTY) {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
        const out = smallify(data.trim(), args);
        process.stdout.write(out + '\n');
        if (args.copy && process.platform === 'win32') spawnSync('clip', { input: out });
        process.exitCode = 0;
    });
} else {
    // REPL — each line converts and echoes until Ctrl+C.
    console.log('smallify — type text, Enter converts, Ctrl+C quits\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
    rl.prompt();
    rl.on('line', (line) => {
        if (line.trim()) console.log(smallify(line, args));
        rl.prompt();
    });
}
