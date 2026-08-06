/**
 * Commonwealth of Massachusetts v. Lindsay Clancy — the January 24, 2023
 * deaths of the three Clancy children in Duxbury, Massachusetts.
 *
 * This case is ONGOING in real life. Facts below are limited to public
 * filings and reporting; where the record is thin or contested, witnesses are
 * composites flagged "(composite)". The live-research module can refresh this
 * file's facts (see docs/RESEARCH.md); juror-facing material must always stay
 * outcome-blind.
 */
export default {
  id: 'clancy',
  title: 'Commonwealth of Massachusetts v. Lindsay Clancy',
  jurisdiction: 'Plymouth County Superior Court, Massachusetts',
  status: 'Ongoing in real life — simulation uses public pretrial record',
  blurb:
    'A labor-and-delivery nurse is charged with murdering her three young children while her husband ran a brief errand. The Commonwealth alleges planning; the defense answers with postpartum psychosis and a catastrophic medication spiral.',
  disclaimer:
    'Educational dramatization of an ongoing case, based solely on public filings and reporting. Nothing here presumes the real outcome. The presiding judge and several witnesses are composites.',
  parties: {
    defendant: 'Lindsay Clancy, 32, a labor-and-delivery nurse at Massachusetts General Hospital',
    victims: ['Cora Clancy, 5', 'Dawson Clancy, 3', 'Callan Clancy, 8 months'],
    judge: 'Margaret Doyle (composite)',
    prosecutor: 'Assistant District Attorney Jennifer Sprague, Plymouth County',
    defenseCounsel: 'Kevin Reddington',
  },
  factSummary: `On the evening of January 24, 2023, in Duxbury, Massachusetts, Patrick Clancy left the family home for roughly twenty-five to thirty minutes to pick up takeout food and a medication. When he returned, he found his wife Lindsay Clancy on the ground outside beneath a second-story window, gravely injured from a fall, and their three children — Cora, 5, Dawson, 3, and Callan, 8 months — unresponsive in the basement with exercise bands around their necks. Cora and Dawson were pronounced dead that night; the infant Callan died days later at a Boston hospital. The medical examiner attributed the deaths to strangulation. Lindsay Clancy survived with spinal injuries that have left her unable to walk. In the months before, she had been treated for anxiety, depression, and postpartum mental-health complaints; she was prescribed, over roughly four months, a rotating regimen that her attorney has counted at more than a dozen psychiatric medications, including benzodiazepines, antidepressants, and sleep aids. In December 2022 she attended a partial-hospitalization psychiatric program. The Commonwealth alleges the killings were deliberate and planned: prosecutors point to the timing around her husband's errand — for which she suggested the restaurant order — and to phone evidence they characterize as goal-directed conduct that evening. Statements attributed to her after the event, in the Commonwealth's telling, acknowledge the acts; in the defense telling they describe command hallucinations — a voice telling her to kill the children and herself — during a psychotic break. The defense asserts she was overmedicated, misdiagnosed, and legally insane at the moment of the acts. Both sides retained forensic psychiatric experts.`,
  theories: {
    prosecution:
      'This mother chose a window when no one could stop her, sent her husband on an errand she suggested, and strangled her three children one by one — conduct that took organization, time, and purpose. Depression is real, but the evidence of planning, concealment, and sequencing shows a person who knew exactly what she was doing and that it was wrong.',
    defense:
      'Lindsay Clancy loved her children and was, on January 24, a woman destroyed by untreated postpartum psychosis and a reckless carousel of thirteen psychiatric drugs. A commanding voice is not a plan; it is a disease. Under Massachusetts law a person who cannot conform her conduct or appreciate wrongfulness is not criminally responsible — she belongs in a hospital, not a prison.',
  },
  charges: [
    {
      id: 'murder_cora',
      name: 'Count 1: Murder in the first degree — Cora Clancy',
      elements: [
        'The defendant unlawfully killed Cora Clancy',
        'With deliberate premeditation, or with extreme atrocity or cruelty',
        'And the defendant was criminally responsible (sane) at the time',
      ],
      verdictOptions: ['guilty_of_first_degree_murder', 'guilty_of_second_degree_murder', 'not_guilty_by_reason_of_lack_of_criminal_responsibility', 'not_guilty'],
      lesserNote: 'Second-degree murder is a lesser included offense; lack of criminal responsibility (McHoul standard) yields commitment, not release.',
    },
    {
      id: 'murder_dawson',
      name: 'Count 2: Murder in the first degree — Dawson Clancy',
      elements: [
        'The defendant unlawfully killed Dawson Clancy',
        'With deliberate premeditation, or with extreme atrocity or cruelty',
        'And the defendant was criminally responsible at the time',
      ],
      verdictOptions: ['guilty_of_first_degree_murder', 'guilty_of_second_degree_murder', 'not_guilty_by_reason_of_lack_of_criminal_responsibility', 'not_guilty'],
    },
    {
      id: 'murder_callan',
      name: 'Count 3: Murder in the first degree — Callan Clancy',
      elements: [
        'The defendant unlawfully killed Callan Clancy',
        'With deliberate premeditation, or with extreme atrocity or cruelty',
        'And the defendant was criminally responsible at the time',
      ],
      verdictOptions: ['guilty_of_first_degree_murder', 'guilty_of_second_degree_murder', 'not_guilty_by_reason_of_lack_of_criminal_responsibility', 'not_guilty'],
    },
  ],
  juryInstructions: `The defendant is presumed innocent; the Commonwealth must prove each element beyond a reasonable doubt. First-degree murder requires deliberate premeditation — a decision to kill reflected upon, even briefly — or extreme atrocity or cruelty. Because the defense of lack of criminal responsibility has been raised, the Commonwealth must ALSO prove beyond a reasonable doubt that the defendant was criminally responsible: that she did NOT have a mental disease or defect that deprived her of the substantial capacity to appreciate the wrongfulness of her conduct or to conform her conduct to the law (the McHoul standard). If a mental disease deprived her of either capacity, you must find her not guilty by reason of lack of criminal responsibility — which results in commitment for treatment, not freedom, though you are to decide the verdict on the law and evidence alone. Consider each count and each child separately.`,
  witnesses: [
    { id: 'patrick', name: 'Patrick Clancy', side: 'prosecution', description: 'husband of the defendant, father of the children', demeanor: 'shattered but composed; notably unwilling to demonize his wife; the hardest witness in the case for both sides', knowledge: 'Left home about 6 p.m. on January 24, 2023 to pick up a takeout order and a medication — an errand of under half an hour; Lindsay had suggested the restaurant. Returned to find her beneath the window, badly injured, and after her words to him, found the children in the basement. Called 911. In the preceding months watched her struggle with anxiety, insomnia, and worsening postpartum symptoms through many medication changes and a December partial-hospitalization program; she had voiced fears about her own thoughts to providers. He has publicly urged forgiveness and believes the woman that night was not his wife. On cross by either side he remains truthful: she functioned as a loving mother in daily life, and she also researched and scheduled that evening.' },
    { id: 'first_responder', name: 'Sgt. Maria Coelho (composite)', side: 'prosecution', description: 'Duxbury police sergeant, first on scene', demeanor: 'professional, visibly affected recounting the scene', knowledge: 'Responded to the 911 call. Found the defendant conscious but gravely injured on the ground outside; inside and below, the three children with exercise bands around their necks; two could not be revived, the infant was flown to Boston. Secured the scene; observed the basement arrangement and the open second-story window. Documented what the defendant said at the scene, which was brief and is subject to the court\'s pretrial rulings.' },
    { id: 'detective', name: 'Det. Lt. Sean Fahey (composite)', side: 'prosecution', description: 'Massachusetts State Police lead homicide detective', demeanor: 'methodical, careful to stay within rulings', knowledge: 'Led the investigation. Established the timeline: the errand window of roughly 25-30 minutes, the restaurant order, pharmacy stop, phone data. The defendant\'s phone showed activity that evening the Commonwealth characterizes as organized around the errand window. Coordinated the medical examiner findings of ligature strangulation for all three children. Interviewed providers and family; documented months of mental-health treatment. Concedes on cross the phone also contains months of searches about postpartum illness and pleas for help.' },
    { id: 'me_clancy', name: 'Dr. Howard Lin (composite)', side: 'prosecution', description: 'Office of the Chief Medical Examiner', demeanor: 'clinical, quiet', knowledge: 'Autopsies attributed all three deaths to strangulation by ligature, consistent with exercise bands recovered at the scene. The mechanism requires sustained pressure over a period of minutes per child. Injuries indicate the children were overpowered; the infant\'s death followed days of intensive care. No findings speak to the defendant\'s mental state.' },
    { id: 'pros_psych', name: 'Dr. Renata Molloy (composite)', side: 'prosecution', description: 'forensic psychiatrist retained by the Commonwealth', demeanor: 'precise, unmoved, battle-tested expert', knowledge: 'Evaluated the defendant, records, and evidence. Diagnoses severe depression and anxiety but concludes the evidence does not establish psychosis at the moment of the acts: the conduct was sequenced, goal-directed, timed to an absence, and followed by an attempt at self-harm consistent with awareness of wrongdoing. Notes she reported anxiety and intrusive thoughts to providers but was repeatedly assessed without psychotic features in the prior months. Concedes postpartum psychosis exists, can fluctuate rapidly, and that retrospective certainty is impossible; maintains the organized conduct is the best evidence of capacity.' },
    { id: 'pharm_expert', name: 'Dr. Gail Sutton (composite)', side: 'prosecution', description: 'psychopharmacologist for the Commonwealth', demeanor: 'didactic, confident', knowledge: 'Reviewed the prescription history — more than a dozen agents over about four months, including benzodiazepines, SSRIs, mirtazapine, trazodone, and zolpidem. Testifies the regimen, while aggressive, is within treatment practice for refractory postpartum illness, that she was under active provider care, and that none of the medications is established to cause organized homicidal conduct. Concedes polypharmacy of this degree carries recognized risks of disinhibition, akathisia, and worsening in a vulnerable patient.' },
    { id: 'def_psych', name: 'Dr. Miriam Okonjo (composite)', side: 'defense', description: 'forensic psychiatrist specializing in perinatal psychiatry, retained by the defense', demeanor: 'compassionate authority; unshakable on the science of postpartum psychosis', knowledge: 'Evaluated the defendant extensively. Diagnoses postpartum psychosis with command hallucinations — she describes a voice instructing her to kill the children and herself because of what would otherwise happen to them, a recognized psychotic structure, followed by her own suicide attempt. Postpartum psychosis affects roughly 1-2 per 1000 births, fluctuates hour to hour ("waxing and waning"), and can coexist with apparently organized behavior — organization does not equal sanity. The medication carousel, insomnia, and December decompensation were red flags of an emerging psychosis that was treated as mere anxiety. Opines she lacked substantial capacity to appreciate wrongfulness or conform her conduct under McHoul. Concedes her account of the voice comes principally from the defendant herself.' },
    { id: 'treating_np', name: 'NP Sarah Bergin (composite)', side: 'defense', description: 'psychiatric nurse practitioner who managed the defendant\'s medications', demeanor: 'defensive about care decisions, sympathetic to the patient', knowledge: 'Managed the defendant\'s psychiatric medications through fall 2022 into January 2023. Documents her escalating insomnia, anxiety, intrusive thoughts, and fear of being alone with her own mind; records multiple medication starts, stops, and switches in response. The defendant self-reported no hallucinations at appointments and was screened as low acute risk in January. Concedes the practice never obtained a full psychiatric evaluation for psychosis and that zolpidem and benzodiazepine adjustments continued despite worsening.' },
    { id: 'mclean_clinician', name: 'Dr. Aaron Feld (composite)', side: 'defense', description: 'clinician from the December 2022 partial-hospitalization program', demeanor: 'guarded, institutional', knowledge: 'The defendant attended a short partial-hospitalization psychiatric program in December 2022 for worsening postpartum mood symptoms. She engaged in treatment, denied psychosis on screening instruments, and was stepped down with an outpatient plan. Concedes screening relies on self-report and that emerging psychosis in high-functioning patients — particularly nurses who know the questions — can evade detection.' },
    { id: 'friend_colleague', name: 'Nurse Dana Whelan (composite)', side: 'defense', description: 'labor-and-delivery colleague and close friend', demeanor: 'loyal, grieving, credible', knowledge: 'Worked beside the defendant for years; describes a gentle, devoted mother who adored her children and was transparently proud of them. In late 2022 watched her deteriorate — exhausted, hollow, frightened of her own sleeplessness, saying the medications made her feel "not like myself." Never heard her express anger at the children. On cross, acknowledges she did not observe the defendant in the final days.' },
    { id: 'defendant_clancy', name: 'Lindsay Clancy', side: 'defense', description: 'the defendant (testifies only if the defense calls her)', demeanor: 'flat affect broken by grief; medicated calm; answers slowly from a wheelchair', knowledge: 'Loved Cora, Dawson, and Callan more than her life. Remembers the fall of 2022 as a fog of sleeplessness, dread, and medications that made her feel unreal. Describes, from inside, the evening of January 24 as commanded by a voice that told her the children had to die and she had to follow — she believed she was saving them from something worse. Remembers fragments: the bands, the stairs, the window. Knows what she did and lives in it; does not ask forgiveness. On cross, cannot fully explain the errand timing; says the voice chose it.' },
  ],
  evidence: [
    { id: 'call_911_patrick', label: 'Exhibit 1: 911 call — Patrick Clancy', desc: 'Recording of the husband\'s call upon returning home', offeredBy: 'prosecution' },
    { id: 'timeline', label: 'Exhibit 2: Errand timeline', desc: 'Restaurant order, pharmacy stop, drive times — a window of roughly 25-30 minutes', offeredBy: 'prosecution' },
    { id: 'scene_report', label: 'Exhibit 3: Scene report and photographs (limited)', desc: 'Basement scene, exercise bands, open second-story window (sanitized subset per rulings)', offeredBy: 'prosecution' },
    { id: 'me_reports', label: 'Exhibit 4: Medical examiner reports (3)', desc: 'Ligature strangulation findings for Cora, Dawson, and Callan', offeredBy: 'prosecution' },
    { id: 'bands', label: 'Exhibit 5: Exercise bands', desc: 'Ligatures recovered at the scene', offeredBy: 'prosecution' },
    { id: 'phone_data', label: 'Exhibit 6: Defendant\'s phone extraction', desc: 'Activity on the evening of January 24 and preceding weeks', offeredBy: 'prosecution' },
    { id: 'searches', label: 'Exhibit 7: Search history (contested scope)', desc: 'Queries the Commonwealth frames as planning and the defense frames as illness and help-seeking', offeredBy: 'both' },
    { id: 'statements', label: 'Exhibit 8: Post-incident statements (as admitted)', desc: 'The defendant\'s brief statements after the event, per the court\'s pretrial rulings', offeredBy: 'both' },
    { id: 'rx_history', label: 'Exhibit 9: Prescription history', desc: 'More than a dozen psychiatric medications across ~4 months: benzodiazepines, SSRIs, mirtazapine, trazodone, zolpidem, others', offeredBy: 'defense' },
    { id: 'php_records', label: 'Exhibit 10: December 2022 partial-hospitalization records', desc: 'Admission for worsening postpartum symptoms; screening results; step-down plan', offeredBy: 'defense' },
    { id: 'provider_notes', label: 'Exhibit 11: Outpatient provider notes', desc: 'Documented insomnia, anxiety, intrusive thoughts, medication churn, low-risk screenings', offeredBy: 'defense' },
    { id: 'fall_injuries', label: 'Exhibit 12: Defendant\'s medical records — the fall', desc: 'Spinal injuries from the second-story fall; permanent paralysis', offeredBy: 'defense' },
    { id: 'pros_psych_report', label: 'Exhibit 13: Commonwealth psychiatric evaluation', desc: 'Report concluding criminal responsibility not negated', offeredBy: 'prosecution' },
    { id: 'def_psych_report', label: 'Exhibit 14: Defense psychiatric evaluation', desc: 'Report diagnosing postpartum psychosis with command hallucinations', offeredBy: 'defense' },
    { id: 'family_photos', label: 'Exhibit 15: Family photographs and videos', desc: 'The defendant caring for the children in the months before', offeredBy: 'defense' },
    { id: 'texts_patrick', label: 'Exhibit 16: Text messages between the defendant and her husband', desc: 'Months of messages about her symptoms, fear, and treatment', offeredBy: 'defense' },
    { id: 'ppp_literature', label: 'Exhibit 17: Peer-reviewed literature on postpartum psychosis', desc: 'Incidence, waxing-and-waning course, command hallucinations, infanticide risk', offeredBy: 'defense' },
    { id: 'med_effects', label: 'Exhibit 18: Pharmacology literature', desc: 'Disinhibition/akathisia risks of the prescribed regimen', offeredBy: 'defense' },
    { id: 'work_records', label: 'Exhibit 19: Employment records', desc: 'Her functioning as an L&D nurse; leave taken in late 2022', offeredBy: 'both' },
    { id: 'home_layout', label: 'Exhibit 20: Home layout diagram', desc: 'Basement, stairs, and second-story window locations', offeredBy: 'prosecution' },
  ],
  aiPretrialMotions: {
    prosecution: [
      { id: 'p1', title: 'Motion in limine to limit "overmedication" evidence absent causation', argument: 'The defense should not parade thirteen drug names before the jury without expert testimony that any of them can cause this conduct. Prescription counts without causation are sympathy dressed as science.' },
      { id: 'p2', title: 'Motion to admit the defendant\'s post-incident statements', argument: 'The defendant\'s brief statements upon her husband\'s return were spontaneous, not the product of interrogation, and are admissible as excited utterances and party admissions probative of awareness.' },
    ],
    defense: [
      { id: 'd1', title: 'Motion to suppress hospital-bed statements to police', argument: 'Any statements taken while the defendant lay catastrophically injured, medicated, and in custody-like restraint, without valid Miranda waiver, must be suppressed as involuntary.' },
      { id: 'd2', title: 'Motion in limine to exclude gruesome scene and autopsy imagery', argument: 'Cause of death will not be contested. The only purpose of this imagery is to make deliberation impossible. A sanitized subset satisfies any legitimate need under the balancing test.' },
      { id: 'd3', title: 'Motion to admit complete mental-health treatment history', argument: 'The entire treatment course — every switch, every screening, the December admission — is the res gestae of the insanity defense and must come in without piecemeal hearsay objections; it is offered for treatment fact, not truth of diagnosis.' },
    ],
  },
  aliases: [
    ['Lindsay Clancy', 'the defendant, Ms. L.'],
    ['Lindsay', 'Ms. L.'],
    ['Patrick Clancy', 'the husband, Mr. P.'],
    ['Patrick', 'Mr. P.'],
    ['Clancy', 'the family'],
    ['Cora', 'the eldest child'],
    ['Dawson', 'the middle child'],
    ['Callan', 'the infant'],
    ['Duxbury', 'the town'],
    ['Massachusetts General Hospital', 'a major hospital'],
  ],
  jurorPool: [
    { seat: 1, name: 'Arthur Pemberton', age: 66, occupation: 'retired fire captain', background: 'Ran into burning buildings for thirty years; has seen people do the unthinkable in crisis.', disposition: 'believes in duty, open to how minds break' },
    { seat: 2, name: 'Grace Nkemdirim', age: 37, occupation: 'hospital pharmacist', background: 'Fills these exact prescriptions daily; knows interaction risk tables cold.', disposition: 'laser-focused on the medication evidence' },
    { seat: 3, name: 'Sal DiBenedetto', age: 54, occupation: 'plumbing contractor', background: 'Father of four; wary of expert witnesses who charge by the hour.', disposition: 'blunt, skeptical of both hired psychiatrists' },
    { seat: 4, name: 'Hannah Ostrander', age: 31, occupation: 'new mother on leave from accounting', background: 'Eight months postpartum herself; knows the sleepless dread firsthand.', disposition: 'deep empathy, determined not to let it decide for her' },
    { seat: 5, name: 'Wendell Gray', age: 59, occupation: 'probation officer', background: 'Twenty-five years judging who is dangerous and who is sick.', disposition: 'pragmatic about accountability and treatment' },
    { seat: 6, name: 'Celia Vasquez', age: 43, occupation: 'elementary school teacher', background: 'Teaches five-year-olds; the victims\' ages sit heavy on her.', disposition: 'fights to keep grief from becoming verdict' },
    { seat: 7, name: 'Douglas Finch', age: 48, occupation: 'actuary', background: 'Prices rare events professionally; 1-2 per 1000 births is a number he can work with.', disposition: 'coldly rational, follows base rates and burdens' },
    { seat: 8, name: 'Maeve Callahan', age: 62, occupation: 'retired psychiatric nurse', background: 'Decades on inpatient wards; has seen psychosis hide inside competence.', disposition: 'authoritative on symptoms, careful not to testify herself' },
    { seat: 9, name: 'Jerome Watts', age: 35, occupation: 'freight dispatcher', background: 'Lost a cousin to suicide; thinks about what warnings get missed.', disposition: 'quiet, attentive to the treatment timeline' },
    { seat: 10, name: 'Patricia Yune', age: 51, occupation: 'small-claims mediator', background: 'Settles disputes by finding what each side must concede.', disposition: 'consensus-builder, presses for precise findings' },
    { seat: 11, name: 'Colin Brody', age: 27, occupation: 'personal trainer', background: 'Uses resistance bands professionally; the physical details are vivid to him.', disposition: 'concrete thinker, needs the mechanics to add up' },
    { seat: 12, name: 'Eleanor Sachs', age: 70, occupation: 'retired family-court clerk', background: 'A career watching families at their worst without losing faith in law.', disposition: 'measured, insists on the McHoul standard as written' },
  ],
  researchHint: 'Commonwealth v. Lindsay Clancy, Plymouth County — ONGOING. Refresh public filings, expert disclosures, and rulings; never surface real-world outcome or media sentiment to jurors.',
};
