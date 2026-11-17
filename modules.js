// Course catalog (from the course plan outline). Minutes are placeholders until the content is built.
// testOut: a returning counselor may open the module on "Show what you know". Never for anything
// new/changed since last summer (those are also forced by T_Config "What's new" rows).
window.TRAIN_PARTS = { 1: 'Part 1 · Being a Bus Counselor', 2: 'Part 2 · Using Bus Comms' };
window.TRAIN_MODULES = [
  { id: 'p1-welcome',    part: 1, title: 'Welcome',                                  steps: ['read', 'check'],       minutes: 6,  testOut: false },
  { id: 'p1-travel',     part: 1, title: 'Getting to & From Camp',                   steps: ['read', 'check'],       minutes: 6,  testOut: true },
  { id: 'p1-attendance', part: 1, title: 'Taking Attendance',                        steps: ['read', 'check', 'do'], minutes: 9,  testOut: true },
  { id: 'p1-arrivals',   part: 1, title: 'Arrivals, Departures & Drop-Offs',         steps: ['read', 'check', 'do'], minutes: 10, testOut: true },
  { id: 'p2-login',      part: 2, title: 'Welcome & logging in',                     steps: ['watch', 'check'],      minutes: 4,  testOut: true },
  { id: 'p2-screen',     part: 2, title: 'Reading your bus screen',                  steps: ['watch', 'check'],      minutes: 4,  testOut: true },
  { id: 'p2-texting',    part: 2, title: 'Texting one family',                       steps: ['watch', 'check', 'do'], minutes: 6, testOut: true },
  { id: 'p2-broadcast',  part: 2, title: 'Broadcasting to the whole bus',            steps: ['watch', 'check', 'do'], minutes: 5, testOut: true },
  { id: 'p2-alerts',     part: 2, title: 'Attendance alerts & the 3-minute rule',    steps: ['watch', 'check', 'do'], minutes: 6, testOut: true },
  { id: 'p2-gps',        part: 2, title: 'GPS & Share My Location',                  steps: ['watch', 'check', 'do'], minutes: 6, testOut: true },
  { id: 'p2-games',      part: 2, title: 'Bus Games',                                steps: ['watch', 'check', 'do'], minutes: 5, testOut: true },
  { id: 'p2-alldone',    part: 2, title: '"All Done" checkout',                      steps: ['watch', 'check', 'do'], minutes: 5, testOut: false, isNew: true },
  { id: 'p2-whatif',     part: 2, title: '"What if..?" help tool',                   steps: ['watch', 'check', 'do'], minutes: 6, testOut: false, isNew: true },
  { id: 'p2-help',       part: 2, title: 'Troubleshooting, etiquette & reaching camp', steps: ['watch', 'check'],    minutes: 5, testOut: false },
  { id: 'p2-multistop',  part: 2, title: 'Bonus: multi-stop buses (60/70)',          steps: ['watch', 'check'],      minutes: 4,  testOut: true, bonus: true },
];
// Returning counselors start here; counts as one required item for them.
window.TRAIN_WHATSNEW = { id: 'whatsnew', part: 1, title: "What's new since last summer", steps: ['read'], minutes: 1, testOut: false };
