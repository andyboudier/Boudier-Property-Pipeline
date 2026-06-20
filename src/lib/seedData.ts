import type { Property } from "./types";
import { defaultIpadInputs, sqftToSqm } from "./ipadCalc";

// Build IPAD inputs from a residual-style brief so the appraisal reproduces the
// pipeline's residual economics (£/sq ft build cost → £/m² new-build rate).
function ipadFromResidual(opts: {
  purchasePrice: number;
  buildSqFt: number;
  buildCostPerSqFt: number;
  units: { units: number; m2: number; type: string; totalGdv: number }[];
  contingencyPct?: number;
  feesProfile?: Partial<ReturnType<typeof defaultIpadInputs>>;
}) {
  const areaM2 = sqftToSqm(opts.buildSqFt);
  const ratePerM2 = opts.buildCostPerSqFt / 0.092903;
  return {
    inputs: defaultIpadInputs({
      areaM2: Math.round(areaM2),
      purchasePrice: opts.purchasePrice,
      stampDuty: Math.round(opts.purchasePrice * 0.04), // commercial SDLT approximation
      solicitors: 15000,
      newBuildRatePerM2: Math.round(ratePerM2),
      contingencyPct: opts.contingencyPct ?? 0.05,
      units: opts.units.map((u, i) => ({ id: `u${i + 1}`, ...u })),
      ...opts.feesProfile,
    }),
  };
}

export const SEED_PROPERTIES: Property[] = [
  {
    id: "copper-beeches-andover",
    name: "Copper Beeches, Woodlands Way",
    town: "Andover",
    lpa: "Test Valley BC",
    guidePrice: 800000,
    sizeSqFt: 10000,
    pricePerSqFt: 80,
    currentUse: "Care home — Use Class C2",
    heritage: "Not listed; CA status to verify; operating 36-bed home",
    pdRoute: "NO — C2 has no PD right to residential (C3)",
    fullPlanningRoute: "Yes — full change of use (C2→C3)",
    keyConstraints:
      "Priced as a care/going-concern asset; low Andover flat values (~£150k) make flats conversion unviable on residual; access & parking; affordable housing if >10 units",
    planningPrinciple: "Residential achievable in principle; viability poor as flats",
    likelyOutcome:
      "As flats: does NOT stack at £800k (negative residual). Houses-led scheme, or retain/relet as care, performs far better",
    priorityNextStep: "Confirm VP vs going concern; re-model as care-hold or houses-led; residual",
    listingSource: "Address supplied — no listing link",
    ipad: ipadFromResidual({
      purchasePrice: 800000,
      buildSqFt: 10000,
      buildCostPerSqFt: 130,
      units: [
        { units: 4, m2: 47, type: "1-bed flat", totalGdv: 600000 },
        { units: 6, m2: 60, type: "2-bed flat", totalGdv: 1200000 },
      ],
      contingencyPct: 0.06,
    }),
  },
  {
    id: "sparks-garage-camberley",
    name: "Former Sparks Garage, 2 London Road",
    town: "Camberley",
    lpa: "Surrey Heath BC",
    guidePrice: null,
    sizeSqFt: null,
    pricePerSqFt: null,
    currentUse: "Former motor garage — sui generis",
    heritage: "Not listed; CA status to verify",
    pdRoute: "NO — sui generis (not Class E) & a demolition/rebuild scheme",
    fullPlanningRoute: "Yes — outline 16/0536 for up to 10 units (2016/17)",
    keyConstraints:
      "2016/17 outline VERY LIKELY time-expired (verify); Thames Basin Heaths SPA → SANG/SAMM via CIL; sloping frontage/access pinch; AH threshold if >10 units",
    planningPrinciple: "Residential principle established (prior consent)",
    likelyOutcome: "Approvable; optimum ~10 units. If consent lapsed, fresh full application (cleaner for redesign)",
    priorityNextStep: "Verify consent status on Surrey Heath portal; confirm site area",
    listingSource: "Surrey Heath planning portal",
    listingUrl: "https://publicaccess.surreyheath.gov.uk/online-applications/",
    ipad: ipadFromResidual({
      purchasePrice: 0,
      buildSqFt: 8000,
      buildCostPerSqFt: 200,
      units: [
        { units: 4, m2: 50, type: "1-bed flat", totalGdv: 800000 },
        { units: 6, m2: 65, type: "2-bed flat", totalGdv: 1650000 },
      ],
      contingencyPct: 0.06,
    }),
  },
  {
    id: "four-oaks-brentwood",
    name: "Four Oaks, Ingrave Road",
    town: "Brentwood",
    lpa: "Brentwood BC",
    guidePrice: 1000000,
    sizeSqFt: 8406,
    pricePerSqFt: 118.96,
    currentUse: "Former maternity hospital (C2) / recent temporary accommodation (sui generis)",
    heritage: "Not listed (verify); CA setting nearby; NOT Green Belt (Brentwood is an inset settlement)",
    pdRoute: "NO — C2/sui generis (not Class E); a demolition/rebuild = full planning",
    fullPlanningRoute: "Yes — residential principle strong (established residential-type use)",
    keyConstraints:
      "Title covenant bars HMO & temporary accommodation; Shenfield Common woodland → TPOs/ecology/protected species; CA setting; check Epping Forest SAC zone & CIL",
    planningPrinciple: "Favourable in principle",
    likelyOutcome: "Approvable but design/ecology-led; lower-density (houses or sensitive flats), not max units",
    priorityNextStep: "Policies Map check; Land Registry title EX190689; planning history on correct parcel; pre-app",
    listingSource: "Zoopla (Kemsley LLP)",
    listingUrl: "https://www.zoopla.co.uk/for-sale/commercial/details/73411644/",
    ipad: ipadFromResidual({
      purchasePrice: 1000000,
      buildSqFt: 6990,
      buildCostPerSqFt: 190,
      units: [
        { units: 4, m2: 55, type: "1-bed flat", totalGdv: 520000 },
        { units: 6, m2: 70, type: "2-bed flat", totalGdv: 760000 },
      ],
      contingencyPct: 0.07,
    }),
  },
  {
    id: "21-horse-fair-banbury",
    name: "21 Horse Fair",
    town: "Banbury",
    lpa: "Cherwell DC",
    guidePrice: null,
    sizeSqFt: 6990,
    pricePerSqFt: null,
    currentUse: "Office — Use Class E; vacant 24 months",
    heritage: "GRADE II LISTED; Banbury town-centre Conservation Area",
    pdRoute: "NO — use class/vacancy/size all qualify for MA, BUT listed buildings are excluded from Class MA",
    fullPlanningRoute: "Yes — full planning + Listed Building Consent (LBC)",
    keyConstraints:
      "Heritage/LBC is decisive — retain beams, stone fireplaces, timber staircase; sash windows (secondary glazing, not replacement); internal subdivision; space standards (9 units optimistic)",
    planningPrinciple: "Favourable (vacant listed office → homes is policy-supported)",
    likelyOutcome: "Good odds in principle; consented scheme likely ~6–8 units, heritage-led, not the full 9",
    priorityNextStep: "Historic England list entry; confirm price; Heritage Statement; residual at 6–7 vs 9 units",
    listingSource: "White Commercial",
    listingUrl:
      "https://whitecommercial.co.uk/?view=article&id=879:21-horse-fair-banbury-ox16-0ah-208006&catid=19",
  },
  {
    id: "25-king-square-bristol",
    name: "25 King Square",
    town: "Bristol",
    lpa: "Bristol City Council",
    guidePrice: 1250000,
    sizeSqFt: 5910,
    pricePerSqFt: 211.51,
    currentUse: "Education / recording studios — Use Class F1 (prev. D1)",
    heritage:
      "Stokes Croft CA (CA19, King Square character area); adjacent Grade II Georgian terraces; building itself probably not listed (verify)",
    pdRoute: "NO — F1 (education) sits OUTSIDE Class E, so Class MA does not apply",
    fullPlanningRoute: "Yes — full change of use F1→C3 (+ LBC only if listed)",
    keyConstraints:
      "Loss of community/cultural/education (recording-studio) floorspace — Bristol resists; needs marketing/viability evidence; CA design; basement poor for habitable rooms; ~1 parking (acceptable in central/car-free location)",
    planningPrinciple: "Finely balanced — strong market, but loss-of-cultural-use is a real hurdle",
    likelyOutcome: "Approvable IF loss-of-use is justified; strong Bristol market supports ~6–8 flats; pre-app essential",
    priorityNextStep: "Pre-app + marketing evidence of non-viability of existing use; confirm listed status; CA appraisal",
    listingSource: "Zoopla (David Charles)",
    listingUrl: "https://www.zoopla.co.uk/for-sale/commercial/details/71487562/",
    ipad: ipadFromResidual({
      purchasePrice: 1250000,
      buildSqFt: 5910,
      buildCostPerSqFt: 200,
      units: [
        { units: 3, m2: 50, type: "1-bed flat", totalGdv: 810000 },
        { units: 4, m2: 68, type: "2-bed flat", totalGdv: 1440000 },
      ],
      contingencyPct: 0.06,
    }),
  },
  {
    id: "exhibition-house-soundwell",
    name: "Exhibition House, North View",
    town: "Soundwell, Bristol",
    lpa: "South Gloucestershire",
    guidePrice: 1000000,
    sizeSqFt: 31835,
    pricePerSqFt: 31.41,
    currentUse: "Light industrial — verify E(g)(iii) vs B2/B8",
    heritage: "Not listed; not in CA; CHECK protected employment-land allocation",
    pdRoute:
      "UNLIKELY — if E(g)(iii) MA technically possible but deep floorplate fails natural-light test; if B2/B8 no PD. Treat as full planning",
    fullPlanningRoute: "Yes — full planning, likely demolition & redevelopment",
    keyConstraints:
      "Possible protected employment land (marketing evidence needed); ~35% affordable housing at ~30 units; parking on a tight site; deep-plan/contamination; modest local flat values vs build cost",
    planningPrinciple: "Conditional — hinges on employment-land position",
    likelyOutcome:
      "Achievable if employment loss justified, BUT viability marginal/negative as ~30 flats at current Soundwell values",
    priorityNextStep: "Confirm use class & employment designation; pre-app; residual needs site area",
    listingSource: "Zoopla (Burston Cook)",
    listingUrl: "https://www.zoopla.co.uk/for-sale/commercial/details/67554078/",
    ipad: ipadFromResidual({
      purchasePrice: 1000000,
      buildSqFt: 27000,
      buildCostPerSqFt: 150,
      units: [
        { units: 12, m2: 50, type: "1-bed flat", totalGdv: 1860000 },
        { units: 18, m2: 65, type: "2-bed flat", totalGdv: 3564000 },
      ],
      contingencyPct: 0.05,
    }),
  },
  {
    id: "8-st-johns-great-wakering",
    name: "8 St Johns Road, Great Wakering",
    town: "Great Wakering",
    lpa: "Rochford DC",
    guidePrice: 300000,
    sizeSqFt: 6182,
    pricePerSqFt: 48.53,
    currentUse: "Vacant building plot (with consent)",
    heritage: "Check Great Wakering Conservation Area; CHECK flood zone (low-lying coastal Essex)",
    pdRoute: "N/A — vacant plot; new-build is full planning (already consented)",
    fullPlanningRoute:
      "Consent stated for 4x 1-bed flats + parking (VERIFY extant — 2018 photos suggest it may have lapsed)",
    keyConstraints:
      "Consent age/validity (verify on Rochford portal); flood risk (coastal/low-lying — check EA map); small ~0.14-acre plot limits intensification; modest village flat values vs build cost",
    planningPrinciple: "Established (consented) — subject to validity",
    likelyOutcome: "Buildable as consented 4x 1-bed, BUT £300k OIEO far exceeds development value",
    priorityNextStep: "Verify consent + flood zone; offer near residual (~£40-90k), not £300k",
    listingSource: "Zoopla (Ayers & Cruiks)",
    listingUrl: "https://www.zoopla.co.uk/for-sale/commercial/details/71409608/",
    ipad: ipadFromResidual({
      purchasePrice: 300000,
      buildSqFt: 2400,
      buildCostPerSqFt: 185,
      units: [{ units: 4, m2: 50, type: "1-bed flat", totalGdv: 780000 }],
      contingencyPct: 0.05,
    }),
  },
];
