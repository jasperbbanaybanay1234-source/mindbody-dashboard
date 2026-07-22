/**
 * Onboarding task definitions — 18 tasks across 4 weeks.
 * Each task has an id, week, label, description, and script.
 * Scripts use [Name] as a placeholder for the client's first name.
 *
 * The scripts, bingo card criteria, and reward below reflect one gym's
 * onboarding process — edit freely to match your own program.
 */

const BUSINESS_NAME = import.meta.env.VITE_BUSINESS_NAME || 'Your Gym';

export const ONBOARDING_TASKS = [
  // ─── Week 1 ──────────────────────────────────────────────────────────────
  {
    id: 'w1-pre-session',
    week: 1,
    label: 'Pre-session text',
    description: 'Send a warm welcome text before their very first session. Set expectations, build excitement, and let them know you\'re personally looking out for them.',
    script: `Hey [Name]! 👋 So stoked to welcome you to ${BUSINESS_NAME}. Just wanted to reach out before your first session — wear comfy workout clothes, bring a water bottle, and most importantly, just show up and have fun. We\'ll take care of everything else. See you soon! 💪`,
  },
  {
    id: 'w1-post-session',
    week: 1,
    label: 'Post-session follow-up',
    description: 'Check in after their first session to gather feedback, reinforce their decision to join, and address any concerns early.',
    script: `Hey [Name]! How did you go in your first session? Hope you\'re feeling the good kind of sore 😄 We\'d love to know what you thought — what did you enjoy most? Any questions at all, don\'t hesitate to ask. Honestly so stoked to have you here!`,
  },
  {
    id: 'w1-meeting-review',
    week: 1,
    label: 'Weekly meeting / goal review',
    description: 'Book and conduct their first weekly check-in to review their goals, clarify expectations, and make sure they feel supported.',
    script: `Hey [Name], would love to jump on a quick 15-min call this week to touch base — review your first week, answer any questions, and make sure we\'re setting you up for success. When works best for you this week?`,
  },
  {
    id: 'w1-nurture-checkin',
    week: 1,
    label: 'Nurture check-in',
    description: 'Mid-week personal check-in to show you care, keep them accountable, and address any concerns before they become reasons to stop coming.',
    script: `Hey [Name]! Just checking in mid-week — how are you feeling? Getting your sessions in? 💪 Remember, showing up consistently in Week 1 sets the foundation for everything. Let me know if there\'s anything I can do to support you!`,
  },
  {
    id: 'w1-coach-intros',
    week: 1,
    label: 'Coach introductions',
    description: 'Personally introduce the new client to each coach on the team so they feel welcomed by everyone, not just one person.',
    script: `During their next session, introduce them to each coach by name. Something like: "Hey [Name], I want you to meet [Coach Name] — they\'re one of our coaches and they\'re amazing. Don\'t hesitate to grab any of them if you need help or have a question."`,
  },
  {
    id: 'w1-voice-memo',
    week: 1,
    label: 'End-of-week voice memo',
    description: 'Record and send a personal voice message at the end of Week 1. This personal touch goes a long way in making clients feel seen.',
    script: `Record a 30–45 second voice note:\n"Hey [Name], it\'s [Your Name] from ${BUSINESS_NAME}! Just wanted to reach out at the end of your first week and say — you actually did it. You showed up. Week 1 is done and I honestly couldn\'t be more proud. [Mention something specific — a session they crushed, a moment of effort]. Week 2 is where things start to click, and I\'m so excited for you. See you soon!"`,
  },

  // ─── Week 2 ──────────────────────────────────────────────────────────────
  {
    id: 'w2-booking-text',
    week: 2,
    label: 'Booking text',
    description: 'Confirm their Week 2 sessions are booked. Early in Week 2 is when motivation can dip — a simple booking nudge keeps them on track.',
    script: `Hey [Name]! Hope you\'re recovering well from Week 1 — the soreness means it\'s working 😄 Just checking: do you have your sessions booked for this week? If not, jump into the app now and lock them in. Consistency in Week 2 is where the magic starts to happen!`,
  },
  {
    id: 'w2-circle-back',
    week: 2,
    label: 'Circle back to why',
    description: 'Revisit their original reason for joining. Reconnecting them to their "why" is a powerful tool for long-term retention.',
    script: `Hey [Name], I\'ve been thinking about our first conversation — you mentioned [their reason for joining]. I just wanted to remind you that every session you\'re doing right now is building directly towards that. How are you feeling about your progress so far? What\'s feeling good?`,
  },
  {
    id: 'w2-member-intros',
    week: 2,
    label: 'Member introductions',
    description: 'Personally introduce the client to 2–3 established community members who would be a great fit. Community connection is one of the biggest retention drivers.',
    script: `Think about which members would vibe well with this client. Introduce them in person or via a message:\n"Hey [Member], meet [Name] — they\'re in their second week and absolutely crushing it. I thought you two would get along great!"\n\nOr in session: "[Name], have you met [Member]? They\'ve been coming for [X months] — they\'d be a great person to train alongside."`,
  },
  {
    id: 'w2-phone-call',
    week: 2,
    label: 'End-of-week phone call',
    description: 'Call the client at the end of Week 2 to celebrate their progress and — critically — book their strategy session for Week 3.',
    script: `Call agenda:\n1. Open with a genuine celebration: "Two weeks done — that\'s huge!"\n2. Ask: "How are you feeling physically? Mentally? What\'s changed?"\n3. Introduce the strategy session: "In Week 3 we do a deeper 1-on-1 — it\'s where we map out your whole plan for life beyond the first month. It\'s one of my favourite parts of the process."\n4. Book it right now: "I\'ve got [time] on [day] — does that work?"`,
  },

  // ─── Week 3 ──────────────────────────────────────────────────────────────
  {
    id: 'w3-strategy-nudge',
    week: 3,
    label: 'Strategy session booking nudge',
    description: 'Confirm the strategy session is locked in before Week 3 sessions begin. Don\'t let it fall through the cracks.',
    script: `Hey [Name]! Excited for your Week 3 — this is where things really start to click. Just confirming your strategy session is locked in for [date] at [time]. This is the one where we map out your long-term plan — come prepared to talk about your goals! See you then 🗓️`,
  },
  {
    id: 'w3-strategy-session',
    week: 3,
    label: 'Run strategy session',
    description: 'Conduct the full strategy session. This is the most important conversation in the onboarding journey — take your time and be genuinely curious.',
    script: `Strategy Session Agenda:\n1. Celebrate their 3-week journey and the specific sessions they\'ve completed\n2. Review their original goals — "How far have you come? What\'s surprised you?"\n3. Discuss their experience in detail: wins, challenges, what they enjoy\n4. Paint the 90-day picture: "Where could you realistically be in 3 months if you keep this up?"\n5. Walk through membership options — which is the right fit for their goals?\n6. Address objections warmly and honestly\n7. Sign them up, or book a follow-up if they need more time\n8. Take a photo together if they\'re comfortable`,
  },
  {
    id: 'w3-pipeline-post',
    week: 3,
    label: 'Post to #pipeline Slack',
    description: 'Share a brief update in the internal #pipeline Slack channel so the whole team is across this client\'s progress.',
    script: `Post to #pipeline:\n📋 [Client Name] — Week 3\n💪 [X] sessions completed\n📅 Strategy session: [DONE / booked for DATE]\n🎯 Goals: [brief summary of their goals]\n💡 Notes: [any relevant context — objections, membership interest, personal details]\n➡️ Next step: [specific action]`,
  },
  {
    id: 'w3-update-mindbody',
    week: 3,
    label: 'Update Mindbody profile',
    description: 'Update their Mindbody profile with notes from the strategy session. This ensures any coach who works with them has full context.',
    script: `Add to their Mindbody client notes:\n- Primary goals and motivation (their "why")\n- Membership interest level and any objections raised\n- Important personal details: injuries, work schedule, preferences\n- Strategy session outcome: signed up / follow-up needed / date\n- Ensure email, mobile, and emergency contact are up to date`,
  },
  {
    id: 'w3-send-resources',
    week: 3,
    label: 'Send resources',
    description: 'Share the nutrition guide and any other key resources that support their journey. Timing matters — send right after the strategy session while they\'re motivated.',
    script: `Hey [Name]! Loved our strategy session — I\'m really excited about where you\'re headed 🚀\n\nAs promised, here are some resources to support your journey:\n📖 Nutrition Guide: [link]\n📱 How to book sessions: [link]\n🎯 [Any other relevant resource]\n\nAny questions at all, just reply here. Let\'s make Week 4 the best one yet!`,
  },

  // ─── Week 4 ──────────────────────────────────────────────────────────────
  {
    id: 'w4-selfie-video',
    week: 4,
    label: 'Selfie video message',
    description: 'Record a short, personal selfie video to celebrate Week 4 and their near-completion of the program. This is high-impact, personal, and memorable.',
    script: `Record a 30–60 second selfie video (send via phone):\n"Hey [Name]! It\'s [Your Name]. I cannot believe we\'re already in Week 4 — where has the time gone?! I just wanted to take a moment to tell you how genuinely proud I am of you. You turned up when it was hard. You pushed through [specific moment or win]. The community at ${BUSINESS_NAME} is honestly lucky to have you, and I\'m so excited about what comes next. Let\'s make Week 4 the best one yet. I\'ll see you in the gym!"`,
  },
  {
    id: 'w4-bingo-card',
    week: 4,
    label: 'Bingo card presentation',
    description: `Review the ${BUSINESS_NAME} Bingo Card with the client. Completing all 5 criteria earns them the ${BUSINESS_NAME} shirt. Review each item, celebrate completed ones, and motivate them to finish the remaining ones.`,
    script: `Bingo Card — ${BUSINESS_NAME} Shirt (all 5 required):\n✅ 12 sessions completed in 28 days\n✅ Bring a friend to a Saturday session\n✅ Read the nutrition guide\n✅ Leave a Google review\n✅ Book a strategy session\n\nReview each item with the client:\n- Celebrate any already completed\n- For incomplete items: "This one is totally within reach before the end of Week 4 — here\'s how..."\n- Build excitement: "The shirt is yours when you hit all 5 — and you\'re [X] away!"`,
  },
  {
    id: 'w4-google-review',
    week: 4,
    label: 'Google review nudge',
    description: 'Ask for a Google review at the end of Week 4 when they\'re at peak satisfaction. This is also a bingo card item — frame it as a win for them.',
    script: `Hey [Name]! You have absolutely been smashing it these past 4 weeks and we\'re so grateful you chose ${BUSINESS_NAME} 🙏\n\nIf you\'ve had a great experience, would you mind leaving us a quick Google review? It genuinely means the world to us — it helps other people like you find us and keeps our small community growing.\n\n⭐ Leave a review here: [Google Review Link]\n\nAnd yes — it also ticks off your Google review bingo card item 😄 No pressure at all, but we\'d love to hear your story!`,
  },
];

// Grouped by week for easy lookup
export const TASKS_BY_WEEK = ONBOARDING_TASKS.reduce((acc, task) => {
  if (!acc[task.week]) acc[task.week] = [];
  acc[task.week].push(task);
  return acc;
}, {});
