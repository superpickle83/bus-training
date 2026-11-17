// Local stand-in for the Bus Comms server, used ONLY to record training video of the real bus app.
// Serves the (read-only) bus-pwa files and answers every /api/* call from invented data.
// Nothing here ever contacts a real server; unknown API calls are logged.
const http = require('http'), fs = require('fs'), path = require('path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const FAMILIES = [
  ['fam01', 'Zoe Okafor', 'Grace Okafor', 'Oak Ave'],
  ['fam02', 'Ethan Chen', 'Lily Chen', 'Park Ln'],
  ['fam03', 'Maya Rivera', 'Elena Rivera', 'Maple St'],
  ['fam04', 'Noah Kim', 'Daniel Kim', 'Park Ln'],
  ['fam05', 'Ava Patel', 'Priya Patel', 'Elm Ct'],
  ['fam06', 'Jack Murphy', 'Sean Murphy', 'Oak Ave'],
  ['fam07', 'Sofia Alvarez', 'Marta Alvarez', 'Maple St'],
  ['fam08', 'Ben Cohen', 'Rachel Cohen', 'Elm Ct'],
];

function createFakeServer(pwaDir) {
  const state = { failReply: false, sent: {}, unknown: [], external: 0 };
  const stamp = () => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  };

  const contacts = () => FAMILIES.map(([id, camper, parent, stop]) => ({
    id, phone: id, noContact: false, parent, parent1: parent, parent1Phone: id, parent1Status: 'active',
    parent2: null, parent2Phone: null, parent2Status: 'na', activeContact: 'Parent1', activeContacts: ['Parent1'],
    campers: [camper], displayName: camper, busStop: stop, unread: 0,
    attendanceCode: null, attendanceSessions: null, childAttendance: [],
    messages: (id === 'fam03' ? [{ dir: 'out', body: 'Good morning! Maya is on the bus and we are heading to camp.', time: 'Jul 14 · 7:52 AM', sender: 'You' }] : [])
      .concat(state.sent[id] || []),
  }));

  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (p.startsWith('/api/') || p.startsWith('/__')) {
        let json = {}; try { json = JSON.parse(body || '{}'); } catch (e) {}
        if (p === '/api/client-config') return send(res, 200, { token: 'practice-token', trainingMode: false });
        if (p === '/api/config') return send(res, 200, {});
        if (p === '/api/contacts') return send(res, 200, {
          busName: 'Bus 58', busNumber: '58', busGroup: 'LOCAL', session: 'Week 3 · Jul 12-16', weekNumber: 3, demoMode: false,
          preparedMessages: { type: 'individual', label: 'On my way (5 min)',
            message: 'Deerkill Bus : On our way to your stop — see you in about 5 minutes!' },
          contacts: contacts() });
        if (p === '/api/mark-read') return send(res, 200, { success: true });
        if (p === '/api/reply') {
          if (state.failReply) return req.socket.destroy(); // what "no signal" looks like to the app
          const fam = FAMILIES.find(f => f[0] === json.parentPhone);
          if (!fam) return send(res, 404, { success: false, error: 'Family not found' });
          (state.sent[fam[0]] = state.sent[fam[0]] || []).push({ dir: 'out', body: json.body, time: stamp(), sender: 'You' });
          return send(res, 200, { success: true });
        }
        if (p === '/api/prepared/individual') {
          const fam = FAMILIES.find(f => f[0] === json.parentPhone);
          (state.sent[fam[0]] = state.sent[fam[0]] || []).push({ dir: 'out', body: 'Deerkill Bus : On our way to your stop — see you in about 5 minutes!', time: stamp(), sender: 'Counselor' });
          return send(res, 200, { success: true });
        }
        if (p === '/api/games/proxy') return send(res, 200, { active: false, status: 'closed' });
        if (p === '/api/award' || p === '/api/whatif/cards' || p === '/api/subscribe') return send(res, 200, {});
        state.unknown.push(req.method + ' ' + p);
        return send(res, 200, {});
      }
      const f = path.join(pwaDir, p === '/' || p === '/login' ? 'index.html' : p);
      if (!f.startsWith(pwaDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
  });
  return { server, state };
}
module.exports = { createFakeServer };
