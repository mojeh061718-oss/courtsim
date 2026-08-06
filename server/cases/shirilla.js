/**
 * State of Ohio v. Mackenzie Shirilla — the July 31, 2022 Strongsville crash
 * that killed Dominic Russo and Davion Flanagan.
 *
 * Facts are drawn from the public record. The real proceeding was a bench
 * trial; this simulation tries the case to a jury. Names of peripheral
 * witnesses and trial counsel are composites where the public record is thin,
 * and are flagged "(composite)".
 */
export default {
  id: 'shirilla',
  title: 'State of Ohio v. Mackenzie Shirilla',
  jurisdiction: 'Cuyahoga County Court of Common Pleas, Ohio',
  caseNumber: 'Case No. CR-22-673591 (simulated docket)',
  status: 'Concluded in real life (simulation is outcome-blind)',
  blurb:
    'A 17-year-old drives her Toyota Camry into a brick wall at roughly 100 mph at dawn, killing her boyfriend and his friend. Intentional act of murder, or a catastrophic loss of control?',
  disclaimer:
    'Educational dramatization based on public reporting and court records. The real case was tried to the bench; this simulation is tried to a jury. Peripheral witness and counsel names marked (composite) are fictionalized.',
  parties: {
    defendant: 'Mackenzie Shirilla, 17 years old at the time of the crash',
    victims: ['Dominic Russo, 20 (her boyfriend, front passenger)', 'Davion Flanagan, 19 (rear passenger)'],
    judge: 'Nancy Margaret Russo',
    prosecutor: 'Assistant Prosecuting Attorney Daniel Cole (composite), Cuyahoga County',
    defenseCounsel: 'James Merrick (composite), defense counsel',
  },
  factSummary: `In the early morning darkness of July 31, 2022, around 5:30 a.m., a 2018 Toyota Camry driven by 17-year-old Mackenzie Shirilla left Progress Drive in Strongsville, Ohio and struck the brick wall of a commercial building. Her boyfriend Dominic Russo, 20, and his friend Davion Flanagan, 19, were killed. Shirilla survived and was found unconscious in the wreckage. Business surveillance video captured the Camry driving the empty industrial road, and the State contends it shows the car accelerating smoothly to roughly 100 mph without braking or swerving before impact. The car's event data recorder (EDR) recorded the accelerator pedal at or near 100% in the final seconds, a recorded speed of approximately 100 mph, and no brake application. The roadway was dry, the weather clear. Investigators found no mechanical defect. The State points to the volatile on-again-off-again relationship between Shirilla and Russo, text messages in the weeks before the crash, statements attributed to Shirilla that she would crash the car when upset, and a prior occasion on which she drove at high speed with Russo in the car. The defense contends the crash was a tragic loss of control by a young, inexperienced driver — possibly involving a medical episode, disorientation, or unintended acceleration — and that a teenager with her whole life ahead of her had no intent to kill the boyfriend she loved. Shirilla suffered serious injuries herself, which the defense argues is inconsistent with a planned act.`,
  theories: {
    prosecution:
      'This was not an accident. The video and black-box data show a controlled, deliberate acceleration to 100 mph — full throttle, no braking, no evasion — by a driver who had threatened to do exactly this. The car was the weapon; the wall was the method. She purposely caused serious physical harm that killed two young men.',
    defense:
      'A 17-year-old girl does not murder the boyfriend she loved and a friend by driving herself into a wall at 100 mph — she nearly died in that car. The State cannot rule out loss of control, panic, disorientation at dawn, or misapplied pedals. Reckless, perhaps; purposeful murder, never. The State stretches teenage drama into homicidal intent.',
  },
  hurdles: {
    prosecution: [
      'No direct proof of purpose — no note, no confession; the jury may read five fatal seconds as teenage recklessness, not intent to kill',
      'The defendant was belted and nearly died herself, which cuts against any theory of a planned act',
      'The "crash the car" statements are remote, ambiguous venting from teenagers — vulnerable to exclusion and easy for the defense to reframe',
    ],
    defense: [
      'The EDR physics are brutal: 98-100% throttle held five full seconds, no braking, no swerve, no mechanical defect, dry road',
      'The volatile texts and prior high-speed incident hand the State a ready-made motive-and-pattern narrative',
      'Every innocent explanation (medical episode, pedal error, microsleep) lacks affirmative proof and was undercut by her own workup',
    ],
  },
  charges: [
    {
      id: 'murder_russo',
      name: 'Count 1: Murder of Dominic Russo (felony murder, ORC 2903.02(B))',
      elements: [
        'The defendant caused the death of Dominic Russo',
        'As a proximate result of committing felonious assault (knowingly causing serious physical harm, or attempting harm with a deadly weapon — here, the vehicle)',
      ],
      verdictOptions: ['guilty_of_murder', 'guilty_of_aggravated_vehicular_homicide', 'not_guilty'],
      lesserNote: 'Aggravated vehicular homicide (reckless operation causing death) is available as a lesser offense.',
    },
    {
      id: 'murder_flanagan',
      name: 'Count 2: Murder of Davion Flanagan (felony murder, ORC 2903.02(B))',
      elements: [
        'The defendant caused the death of Davion Flanagan',
        'As a proximate result of committing felonious assault with the vehicle as a deadly weapon',
      ],
      verdictOptions: ['guilty_of_murder', 'guilty_of_aggravated_vehicular_homicide', 'not_guilty'],
      lesserNote: 'Aggravated vehicular homicide is available as a lesser offense.',
    },
  ],
  juryInstructions: `The defendant is presumed innocent. The State must prove every element of each count beyond a reasonable doubt. Murder under Ohio's felony-murder rule requires that the death was proximately caused by the defendant knowingly committing felonious assault — "knowingly" means she was aware her conduct would probably cause serious physical harm; motive is not an element, but intent may be inferred from the manner in which the vehicle was operated. The lesser offense of aggravated vehicular homicide requires only recklessness — heedless indifference to a known risk. If you find purposeful or knowing conduct proven, the greater offense applies; if only recklessness is proven, the lesser; if neither, acquit. Consider each count and each victim separately. Sympathy for anyone involved must play no part.`,
  witnesses: [
    { id: 'det_kless', gender: 'm', name: 'Detective Alan Kless (composite)', side: 'prosecution', description: 'Strongsville Police Department lead detective on the crash investigation', demeanor: 'methodical, unshakeable, occasionally clipped on cross', knowledge: 'Led the investigation. Reviewed surveillance video from two businesses on Progress Drive showing the Camry travel the road, loop through the area once, then accelerate steadily until impact — no brake lights, no swerve. Coordinated the EDR download. Collected phone records and text messages between the defendant and Dominic Russo showing repeated fights and breakups in July 2022, including messages where she raged at him over other girls. Interviewed friends who described the defendant saying that when she was angry she would crash the car. Found no skid marks. Confirmed dry pavement, functioning streetlights, no mechanical defect per the vehicle inspection.' },
    { id: 'reconstructionist', gender: 'f', name: 'Sgt. Dana Whitfield (composite)', side: 'prosecution', description: 'Ohio State Highway Patrol crash reconstructionist and EDR analyst', demeanor: 'precise, technical, patient teacher', knowledge: 'Downloaded and analyzed the Camry\'s event data recorder. In the final five seconds: accelerator pedal 98-100%, speed climbing through the 90s to approximately 100 mph at impact, zero brake application, steering input essentially straight with a slight controlled input toward the building. Calculated the car needed sustained full throttle for many seconds to reach that speed on that stretch. The trajectory required passing through a curve at speed without losing control — consistent with active steering, inconsistent with an incapacitated driver. Cannot say what was in the driver\'s mind; can say the vehicle was under continuous control until impact.' },
    { id: 'first_officer', gender: 'm', name: 'Officer Brian Toth (composite)', side: 'prosecution', description: 'first Strongsville officer on scene', demeanor: 'plainspoken, somber', knowledge: 'Arrived minutes after a passerby\'s 911 call at dawn. Found the Camry crushed against the brick wall of the commercial building, catastrophic intrusion into the passenger side. Dominic Russo and Davion Flanagan showed no signs of life. The defendant was unconscious in the driver\'s seat and was extricated by fire personnel. Photographed the scene; observed no skid marks on the approach. Found vape devices in the wreckage.' },
    { id: 'me', gender: 'f', name: 'Dr. Elena Vargas (composite)', side: 'prosecution', description: 'Cuyahoga County deputy medical examiner', demeanor: 'clinical, unflappable', knowledge: 'Performed the autopsies. Both young men died of blunt-force injuries consistent with a high-speed frontal impact; injuries were immediately fatal or nearly so. Toxicology on the victims was not causal to the crash. Manner of death rulings deferred to the circumstances of the driving; can testify to the devastating energy involved at ~100 mph.' },
    { id: 'friend', gender: 'f', name: 'Kayla Brenner (composite)', side: 'prosecution', description: 'former close friend of the defendant', demeanor: 'nervous, reluctant, emotional — a friend testifying against a friend', knowledge: 'Was close with the defendant in 2022. Heard the defendant say, more than once, that when she got really angry at Dominic she would "crash the car" or that they would "go out together." Witnessed one earlier occasion when the defendant, upset after a fight with Dominic, drove fast and erratically with him in the car while he begged her to slow down. Knew the relationship as intense, jealous, and constantly breaking up and reuniting in July 2022. Loved both Mackenzie and Dominic; did not believe she truly meant it at the time.' },
    { id: 'surveillance_owner', gender: 'm', name: 'Marcus Delgado (composite)', side: 'prosecution', description: 'business owner on Progress Drive who provided surveillance footage', demeanor: 'matter-of-fact', knowledge: 'His warehouse cameras cover Progress Drive. Provided police the recordings from the early morning of July 31, 2022. The system timestamps accurately. One camera shows a sedan pass at moderate speed, and minutes later the same sedan traveling extremely fast toward the building next door, followed by the sound of impact. He did not witness the crash live and knows none of the people involved.' },
    { id: 'trauma_surgeon', gender: 'f', name: 'Dr. Priya Raman (composite)', side: 'prosecution', description: 'MetroHealth trauma surgeon who treated the defendant', demeanor: 'careful, protective of patient confidences, testifying under subpoena', knowledge: 'Treated the defendant for serious but survivable injuries after extrication. She was intubated initially and hospitalized for an extended period. Found no evidence in her workup of a seizure disorder, cardiac event, or diabetic episode that would explain sudden incapacitation, though such events cannot always be excluded retrospectively. Her tox screen results and hospital course are in the records. She recovered the physical capacity to walk and speak.' },
    { id: 'digital_examiner', gender: 'm', name: 'Spec. Jordan Mills (composite)', side: 'prosecution', description: 'digital forensics examiner, Cuyahoga County', demeanor: 'dry, exact', knowledge: 'Extracted the defendant\'s phone. Text threads with Dominic Russo in July 2022 show explosive fights, jealousy over other girls, breakups and reconciliations, including angry messages from the defendant in the days before the crash. Location data places the car looping through the industrial area before the final acceleration. Nothing on the phone indicates the phone was in use in the final approach.' },
    { id: 'defense_recon', gender: 'm', name: 'Dr. Walter Igel (composite)', side: 'defense', description: 'defense accident reconstruction and human-factors expert', demeanor: 'professorial, combative on cross', knowledge: 'Reviewed the EDR data, video, and scene. EDR pedal data shows what the pedal did, not why — pedal misapplication by panicked young drivers is a documented phenomenon, and full-throttle pedal errors lasting several seconds occur in the literature. Dawn lighting on an unfamiliar industrial road can produce disorientation. The slight steering input the State calls "controlled" is equally consistent with an inattentive or panicking driver following the road\'s geometry. A driver intent on hitting a wall would not typically be belted; her survival and injuries are consistent with an unplanned event. Concedes on cross: no mechanical defect was found, and the EDR shows no braking.' },
    { id: 'defense_tox', gender: 'f', name: 'Dr. Simone Aldrich (composite)', side: 'defense', description: 'defense toxicologist and sleep/impairment expert', demeanor: 'measured, academic', knowledge: 'Reviewed hospital records and scene evidence including vape devices. At 5:30 a.m. after a night awake, an adolescent driver is in a circadian trough; microsleeps and automatic behavior episodes can produce sustained pedal application without conscious intent. Cannot say this occurred — only that the physiological possibility cannot be excluded on this record. Concedes on cross that the sustained smooth acceleration over many seconds with steering is atypical for microsleep.' },
    { id: 'mother', gender: 'f', name: 'Natalie Shirilla (composite)', side: 'defense', description: 'mother of the defendant', demeanor: 'devastated, protective, credible in her grief', knowledge: 'Mackenzie was a normal teenager — worked a part-time job, loved Dominic, had plans for the future, was never violent. The morning of the crash she had no known reason to be in that industrial area other than teenagers driving around as they often did. The family knows of no suicide attempts or threats. She has no memory of the crash itself and has grieved Dominic and Davion since. On cross, acknowledges she was not present for the fights or the statements friends described.' },
    { id: 'defendant', gender: 'f', name: 'Mackenzie Shirilla', side: 'defense', description: 'the defendant (testifies only if the defense calls her)', demeanor: 'quiet, emotional, fragile; steadfast that she remembers nothing of the final moments', knowledge: 'Loved Dominic despite their fights; the texts were teenage drama, not threats. Remembers picking up Dominic and Davion and driving; her last clear memory is well before Progress Drive, then waking in the hospital. Denies any intention to hurt anyone, denies planning to crash, denies saying she would crash the car "seriously" — if she said anything like that it was venting. Cannot explain the EDR data. Was belted. Suffered serious injuries and long rehabilitation.' },
  ],
  evidence: [
    { id: 'edr', label: 'Exhibit 1: Event Data Recorder download', desc: 'Final 5 seconds: accelerator 98-100%, ~100 mph at impact, no braking, minimal steering change', offeredBy: 'prosecution' },
    { id: 'video_final', label: 'Exhibit 2: Surveillance video — final approach', desc: 'Camry accelerating down Progress Drive into the building; no brake lights', offeredBy: 'prosecution' },
    { id: 'video_loop', label: 'Exhibit 3: Surveillance video — earlier pass', desc: 'Same car passing through the area minutes earlier at moderate speed', offeredBy: 'prosecution' },
    { id: 'scene_photos', label: 'Exhibit 4: Scene photographs', desc: 'Vehicle against brick wall, crush damage, no skid marks on approach', offeredBy: 'prosecution' },
    { id: 'autopsy_russo', label: 'Exhibit 5: Autopsy report — Dominic Russo', desc: 'Blunt-force injuries, immediately fatal', offeredBy: 'prosecution' },
    { id: 'autopsy_flanagan', label: 'Exhibit 6: Autopsy report — Davion Flanagan', desc: 'Blunt-force injuries, immediately fatal', offeredBy: 'prosecution' },
    { id: 'texts', label: 'Exhibit 7: Text message threads (July 2022)', desc: 'Volatile exchanges between defendant and Russo; jealousy, breakups, angry messages days before', offeredBy: 'prosecution' },
    { id: 'friend_statements', label: 'Exhibit 8: Witness statements re: "crash the car" remarks', desc: 'Friends reporting defendant said she would crash the car when angry', offeredBy: 'prosecution' },
    { id: 'prior_driving', label: 'Exhibit 9: Prior high-speed driving incident', desc: 'Earlier occasion driving fast and erratically with Russo begging her to stop', offeredBy: 'prosecution' },
    { id: 'phone_extraction', label: 'Exhibit 10: Phone extraction report', desc: 'Location data and messaging; no phone use on final approach', offeredBy: 'prosecution' },
    { id: 'vehicle_inspection', label: 'Exhibit 11: Vehicle mechanical inspection', desc: 'No defects in throttle, brakes, steering, or tires', offeredBy: 'prosecution' },
    { id: 'road_survey', label: 'Exhibit 12: Roadway survey and conditions report', desc: 'Dry pavement, clear weather, functioning lighting, road geometry', offeredBy: 'prosecution' },
    { id: 'call_911', label: 'Exhibit 13: 911 call recording', desc: 'Passerby reporting the crash at dawn', offeredBy: 'prosecution' },
    { id: 'ems_records', label: 'Exhibit 14: EMS and extrication records', desc: 'Defendant unconscious, belted, extricated from driver\'s seat', offeredBy: 'prosecution' },
    { id: 'hospital_records', label: 'Exhibit 15: Defendant\'s hospital records', desc: 'Injuries, tox screen, workup showing no identified medical event', offeredBy: 'both' },
    { id: 'vapes', label: 'Exhibit 16: Vape devices from wreckage', desc: 'Devices recovered from the vehicle interior', offeredBy: 'defense' },
    { id: 'speed_calc', label: 'Exhibit 17: Reconstruction speed analysis', desc: 'Independent speed calculation corroborating ~100 mph', offeredBy: 'prosecution' },
    { id: 'seatbelt', label: 'Exhibit 18: Restraint analysis', desc: 'Driver belted at impact', offeredBy: 'defense' },
    { id: 'pedal_error_lit', label: 'Exhibit 19: Human-factors literature on pedal misapplication', desc: 'Studies of sustained unintended acceleration by panicked drivers', offeredBy: 'defense' },
    { id: 'relationship_photos', label: 'Exhibit 20: Photos of defendant and Russo together', desc: 'Couple in affectionate moments in summer 2022', offeredBy: 'defense' },
  ],
  aiPretrialMotions: {
    prosecution: [
      { id: 'p1', title: 'Motion in limine to exclude victim-blaming and drug speculation', argument: 'The State moves to exclude speculation that the victims\' own conduct, or unquantified vape/THC use, contributed to the crash, absent expert foundation. It invites the jury to decide on prejudice, not proof.', background: "The wreckage held vape pens and THC product, but toxicology never quantified impairment for anyone in the car, and no expert ties any substance to the crash. The defense has hinted the boys shared in whatever happened that night. If this comes in unchecked, the jury may blame the victims; if it is excluded, the defense loses a doorway to reasonable doubt about state of mind. Arguing for exclusion: speculation without expert foundation is Rule 403 prejudice. Arguing against: the tox findings are facts in the record and go to the totality of that night." },
      { id: 'p2', title: 'Motion to admit the prior high-speed driving incident', argument: 'The prior incident where the defendant drove at high speed with Mr. Russo pleading with her to stop is admissible under Rule 404(B) — not propensity, but intent, absence of accident, and a signature threat carried out.', background: "Weeks before the crash, witnesses say the defendant drove at extreme speed with Dominic Russo in the car while he pleaded with her to slow down, during a stretch of stormy breakups. The State offers it under Rule 404(B) as intent and absence of accident — a rehearsal, not a coincidence. The defense answer: it is one unproven incident, classic propensity dressed up, remote in time, and devastating precisely because juries convict people for being reckless teenagers." },
    ],
    defense: [
      { id: 'd1', title: 'Motion in limine to exclude "crash the car" statements', argument: 'Alleged teenage venting — "I\'ll crash this car" — is classic hearsay-adjacent character evidence, remote, ambiguous, and devastatingly prejudicial under Rule 403. Angry hyperbole is not a confession of future murder.', background: "Multiple friends recall the defendant saying things during fights with Dominic like she would crash the car, including words to the effect of: if you love me you would die with me. These are secondhand teenage recollections of statements made weeks before the crash. For exclusion: angry hyperbole from a 17-year-old is not a murder plan, and the prejudice is enormous. Against exclusion: they are party admissions — direct evidence of intent in a case where intent is the only real question." },
      { id: 'd2', title: 'Motion to exclude the prior driving incident as improper character evidence', argument: 'One alleged incident of fast driving is pure propensity evidence barred by Rule 404. It has no legitimate non-character purpose and would poison the jury.', background: "Same incident the State seeks to admit: the alleged prior high-speed drive with Dominic begging her to stop. For exclusion: Rule 404 bars using one bad drive to prove she is the kind of person who would do it again; there was no citation, no report, only recollection. Against exclusion: it is not character — it is the same threat, same car, same passenger, offered to show intent and absence of accident." },
      { id: 'd3', title: 'Motion to exclude inflammatory scene and autopsy photographs', argument: 'The cause of death is not disputed. Gruesome photographs add nothing but horror and should be limited to a small, sanitized subset under Rule 403.', background: "The State holds scene and autopsy photographs of both young men; cause of death (blunt impact at roughly 100 mph) is undisputed. For limitation: when cause is conceded, gore only inflames — a small sanitized subset satisfies any legitimate need. Against limitation: the sheer violence of the impact IS the State's intent evidence; sanitizing it understates what full throttle into a wall means." },
    ],
  },
  aliases: [
    ['Mackenzie Shirilla', 'the defendant, Ms. S.'],
    ['Mackenzie', 'Ms. S.'],
    ['Shirilla', 'Ms. S.'],
    ['Dominic Russo', 'the first victim, D.R.'],
    ['Dominic', 'D.R.'],
    ['Davion Flanagan', 'the second victim, D.F.'],
    ['Davion', 'D.F.'],
    ['Strongsville', 'the city'],
  ],
  jurorPool: [
    { seat: 1, name: 'Harold Jenks', age: 61, occupation: 'retired tool-and-die machinist', background: 'Raised three kids in a union household; values plain evidence he can touch.', disposition: 'skeptical of experts, trusts video and machines' },
    { seat: 2, name: 'Priscilla Okafor', age: 34, occupation: 'pediatric ICU nurse', background: 'Sees trauma outcomes weekly; keenly aware how fragile teenagers\' judgment is.', disposition: 'empathetic but rigorous about medical claims' },
    { seat: 3, name: 'Dean Malloy', age: 45, occupation: 'commercial truck driver', background: 'Two million accident-free miles; strong opinions about what throttle data means.', disposition: 'confident, blunt, hard on bad driving' },
    { seat: 4, name: 'Alina Petrov', age: 28, occupation: 'graduate student in statistics', background: 'Immigrated at twelve; thinks in probabilities and hates overclaiming.', disposition: 'quiet until the numbers are wrong' },
    { seat: 5, name: 'Marcus Webb', age: 52, occupation: 'high-school football coach', background: 'Has coached a thousand teenagers through heartbreak and stupidity.', disposition: 'believes teens do reckless things without meaning forever' },
    { seat: 6, name: 'Joyce Tanaka', age: 67, occupation: 'retired probate paralegal', background: 'Thirty years around courtrooms; allergic to lawyer theatrics.', disposition: 'procedural, wants elements matched to proof' },
    { seat: 7, name: 'Ray Delacruz', age: 39, occupation: 'auto mechanic and shop owner', background: 'Rebuilds wrecked cars; has read EDR reports for insurance disputes.', disposition: 'practical, dubious of "the car did it" defenses' },
    { seat: 8, name: 'Samantha Bloor', age: 24, occupation: 'barista and community-college student', background: 'Recently out of a volatile relationship herself.', disposition: 'attentive to how couples actually talk and fight' },
    { seat: 9, name: 'Gordon Fitch', age: 58, occupation: 'insurance claims adjuster', background: 'Two decades separating staged losses from real accidents.', disposition: 'cynical about coincidence, fair about proof' },
    { seat: 10, name: 'Renée Boudreaux', age: 47, occupation: 'grief counselor', background: 'Works with families after sudden loss; careful not to let sorrow decide facts.', disposition: 'warm, deliberate, resists rushing to judgment' },
    { seat: 11, name: 'Tomás Rivera', age: 31, occupation: 'city bus operator', background: 'Drives dawn shifts; knows what 5:30 a.m. roads and drowsy drivers look like.', disposition: 'open to fatigue theories, hard-nosed about speed' },
    { seat: 12, name: 'Edith Kowalski', age: 70, occupation: 'retired middle-school principal', background: 'Forty years reading teenagers\' faces and excuses.', disposition: 'firm, fair, unmoved by tears alone' },
  ],
  researchHint: 'Ohio v. Mackenzie Shirilla, Cuyahoga County 2023 — verify crash facts, EDR details, charges. Exclude verdict/sentencing from juror-facing material.',
};
