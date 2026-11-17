// Check questions per module. Every fact traces to the approved video script / course plan.
// `section` (optional) ties a question to a video chapter listed as "new" in T_Config.
window.TRAIN_CONTENT = {
  'p2-texting': {
    video: 'videos/p2-texting',
    checks: [
      { id: 'q1', section: 'scene6',
        text: 'You tap the arrow, but you have no signal and the text doesn’t go through. What happens to your message?',
        options: [
          { k: 'A', t: 'It’s gone — you have to retype it.', note: 'Not anymore! A text that doesn’t send stays in the box.' },
          { k: 'B', t: 'It stays in the box. Tap the arrow again when you’re back online.' },
          { k: 'C', t: 'Bus Comms keeps trying on its own and sends it later.', note: 'It won’t resend by itself — you tap the arrow again.' },
        ], correct: 'B', why: 'Your text stays right there in the box, so just tap the arrow again once you have signal.' },
      { id: 'q2',
        text: 'A parent’s phone number is showing in CampInTouch. How do you reach that family?',
        options: [
          { k: 'A', t: 'Tap the number to call them.', note: 'Tapping a number in CampInTouch calls from your own phone.' },
          { k: 'B', t: 'Text them through Bus Comms.' },
          { k: 'C', t: 'Ask your bus buddy to call.', note: 'Families are contacted through Bus Comms, not personal calls.' },
        ], correct: 'B', why: 'Always text families through Bus Comms. Never tap a phone number in CampInTouch — that calls from your own phone.' },
      { id: 'q3',
        text: 'Your bus has lots of families and you need one fast. What’s quickest?',
        options: [
          { k: 'A', t: 'Scroll the whole list until you spot them.', note: 'That works, but there’s a faster way.' },
          { k: 'B', t: 'Start typing a camper’s or parent’s name in the search box.' },
          { k: 'C', t: 'Call the camp office and ask.', note: 'You don’t need to — the search box finds them.' },
        ], correct: 'B', why: 'Type any part of a camper’s or parent’s name and the list narrows right away.' },
    ],
  },
};
