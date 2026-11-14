const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
const js = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

const errors = [];
function assert(condition, message) {
  if (!condition) {
    errors.push(message);
    console.error('FAIL: ' + message);
  } else {
    console.log('PASS: ' + message);
  }
}

console.log('--- Checking HTML Requirements ---');

// 1. Favicon check
assert(html.includes('<link rel="icon" href="data:,">'), 'Favicon is blank data URI');

// 2. Sections and anchors in order
const sections = ['#home', '#about', '#platform', '#how-it-works', '#market-pricing', '#faq'];
let lastIndex = 0;
for (const sec of sections) {
  const id = sec.substring(1);
  const idx = html.indexOf(`id="${id}"`, lastIndex);
  assert(idx > -1, `Section ${sec} exists in order`);
  lastIndex = idx;
}

// Check #request-a-pilot is inside #market-pricing
const marketPricingIdx = html.indexOf('id="market-pricing"');
const faqIdx = html.indexOf('id="faq"');
const requestPilotIdx = html.indexOf('id="request-a-pilot"');
assert(requestPilotIdx > marketPricingIdx && requestPilotIdx < faqIdx, '#request-a-pilot is inside Market & Pricing');

// Check footer is after faq
const footerIdx = html.indexOf('<footer');
assert(footerIdx > faqIdx, 'Footer is after FAQ');

// 3. Wordmark and Public Name
assert(html.includes('CareSense360'), 'Uses CareSense360');
assert(!html.includes('CareSense AI'), 'Does not use CareSense AI on public page');
assert(!html.includes('class="brand-mark"'), 'Logo icon next to CareSense360 is removed');
assert(!html.includes('class="footer-brand-icon"'), 'Logo icon next to CareSense360 in footer is removed');

// 4. Section 1 Content
assert(html.includes('Spot changes in a resident’s usual routine earlier.'), 'Hero headline matches');
assert(html.includes('CareSense360 is being developed to bring care notes, medication records and staffing information together. When observations across shifts suggest a change in a resident’s usual pattern, the platform shows the care team what changed and why it warrants review. A care professional decides what happens next.'), 'Hero description matches');
assert(html.includes('The initial pilot is planned for two to three West Midlands care homes that already use digital care records.'), 'Hero pilot note matches');
assert(html.includes('Illustrative example'), 'Illustrative example label is present');
assert(html.includes('A change across shifts'), 'Illustrative heading matches');
assert(html.includes('Day shift · Breakfast intake lower than usual'), 'Observation 1 matches');
assert(html.includes('Night shift · More disturbed nights recorded'), 'Observation 2 matches');
assert(html.includes('A senior carer reviews both observations against the resident’s usual routine and records the outcome.'), 'Review note matches');

// 5. Section 2 Content
assert(html.includes('A clearer picture across care shifts'), 'About heading matches');
assert(!html.includes('A carer may notice that a resident has eaten less breakfast than usual.'), 'Removed requested block of information');
assert(html.includes('CareSense360 is designed to work alongside the care-planning, medication and staffing systems a home already uses. Its purpose is to bring relevant observations together, explain emerging changes and help staff follow an agreed action through to its outcome.'), 'About intended role matches');
assert(html.includes('Puneet Kanthera Dhiman'), 'Founder name matches');
assert(html.includes('Founder and Director'), 'Founder role matches');
assert(html.includes('Birmingham, UK'), 'Founder location matches');
assert(!html.includes('founder-monogram'), 'Founder photo/monogram avatar is removed');
assert(html.includes('Puneet Kanthera Dhiman is the sole founder and director of CareSense360. His background includes managing renovation projects, coordinating teams and schedules, overseeing budgets and working directly with clients. He studied International Business Management at Coventry University, with MSc studies covering data analytics and forecasting. His planned responsibilities include business strategy, pilot partnerships and commercial delivery, supported by specialist clinical, software and data professionals.'), 'Founder bio matches');

// 6. Section 3 Platform Modules
assert(html.includes('What the platform will do'), 'Platform heading matches');
assert(html.includes('Year 1 · Initial pilot'), 'Year 1 label present');
assert(html.includes('Year 2 · Planned expansion'), 'Year 2 label present');
assert(html.includes('Year 3 · Planned expansion'), 'Year 3 label present');

const modules = [
  'Data Intake and Normalisation',
  'Resident Baseline and Risk Engine',
  'Human Validation and Task Workflow',
  'Smart Inventory and Procurement',
  'Maintenance and Compliance Evidence',
  'Family Portal and Outcome Reporting'
];

for (const mod of modules) {
  assert(html.includes(mod), `Module "${mod}" present`);
}

// 7. Section 4 How It Works
assert(html.includes('From a care note to a reviewed action'), 'How It Works heading matches');
const steps = [
  'Connect existing records',
  'Learn each resident’s usual pattern',
  'Identify and explain a change',
  'Ask a care professional to review',
  'Record the action and its outcome'
];
for (const step of steps) {
  assert(html.includes(step), `Step "${step}" present`);
}

// Risk stages
const stageMatches = [
  html.indexOf('Normal'),
  html.indexOf('Emerging Change'),
  html.indexOf('Increasing Risk'),
  html.indexOf('High Concern')
];
assert(
  stageMatches[0] < stageMatches[1] &&
  stageMatches[1] < stageMatches[2] &&
  stageMatches[2] < stageMatches[3],
  'Risk stages appear in exact order: Normal -> Emerging Change -> Increasing Risk -> High Concern'
);

// 8. Section 5 Pricing
assert(html.includes('Pricing for UK care homes'), 'Pricing heading matches');
assert(html.includes('The initial pilot is aimed at West Midlands residential and nursing care homes with existing digital records. After the pilot, the plan prioritises care groups operating 2–15 homes and larger independent operators. Owners and group operations leaders are the commercial buyers. Registered managers, senior carers and staff on shift are the intended day-to-day users.'), 'Pricing intro matches');
assert(html.includes('£8–£15'), 'Core subscription price matches');
assert(html.includes('An additional £3–£6'), 'Smart Inventory Add-On price matches');
assert(html.includes('per bed per month'), 'per bed per month billing unit present');
assert(html.includes('Pilot pricing example'), 'Worked example heading matches');
assert(html.includes('The indicative initial pilot rate is approximately £8 per bed per month. For a 40-bed home, that is approximately £320 per month for the core subscription, before any agreed onboarding fee. Across the full core subscription range, a 40-bed home would pay £320–£600 per month.'), 'Worked example text matches');

// 9. Request a Pilot Form
assert(html.includes('id="pilot-form"'), 'pilot-form ID present');
assert(html.includes('id="pilot-status"'), 'pilot-status ID present');
assert(html.includes('role="status"'), 'role="status" present on feedback element');
assert(html.includes('aria-live="polite"'), 'aria-live="polite" present on feedback element');
assert(!html.includes('This form saves your details in this browser only. It does not send them to the CareSense360 team.'), 'Notice sentence removed as requested');
assert(!html.includes('placeholder='), 'Pre-entered data / placeholders removed as requested');
assert(html.includes('Send a pilot request'), 'Submit button text updated to "Send a pilot request"');

const fieldNames = ['fullName', 'phoneNumber', 'emailAddress', 'organisationName'];
for (const field of fieldNames) {
  assert(html.includes(`name="${field}"`), `Field name="${field}" present`);
}

// 10. FAQ Questions
const faqs = [
  'Can we keep our current care-planning system?',
  'Who decides what happens after an alert?',
  'How long does it take to learn a resident’s usual pattern?',
  'How is resident information expected to be protected?',
  'What is included in the initial pilot?',
  'Who is the initial pilot aimed at?',
  'How much would the pilot cost for a 40-bed home?'
];
for (const q of faqs) {
  assert(html.includes(q), `FAQ "${q}" present`);
}

// 11. Footer
assert(html.includes('Predictive care intelligence for UK residential and nursing care homes.'), 'Footer description matches');
assert(html.includes('Founded by Puneet Kanthera Dhiman · Birmingham, UK'), 'Footer founder line matches');

// 12. Background & Animations
assert(html.includes('ambient-glow-wrapper'), 'Ambient animated canvas wrapper present');
assert(css.includes('floatOrb1'), 'Orb 1 keyframe animation defined');
assert(css.includes('floatOrb2'), 'Orb 2 keyframe animation defined');
assert(!css.includes('--bg-base: #FBF9F5'), 'White/off-white base background replaced');

if (errors.length === 0) {
  console.log('\nALL REQUIREMENT SUITES PASSED PERFECTLY!');
} else {
  console.error(`\n${errors.length} ASSERTIONS FAILED.`);
  process.exit(1);
}
