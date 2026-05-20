export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function parseBlock(block, text) {
  if (block === 'vehicle') return parseVehicle(text);
  if (block === 'mechanics') return parseMechanics(text);
  if (block === 'body') return parseLines(text, 6);
  if (block === 'cell') return parseLines(text, 14);
  throw new Error('Bloc inconnu');
}

function parseDate(text) {
  const n = normalize(text);
  const date = n.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (date) {
    let [, d, m, y] = date;
    if (y.length === 2) y = `20${y}`;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  const months = {
    janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
    juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12'
  };
  for (const [month, value] of Object.entries(months)) {
    if (n.includes(month)) {
      const year = n.match(/(19|20)\d{2}/)?.[0];
      if (year) return `01/${value}/${year}`;
    }
  }
  const year = n.match(/(19|20)\d{2}/)?.[0];
  return year ? `01/01/${year}` : '';
}
'Volkswagen', vw: 'Volkswagen',
  // W
  weinsberg: 'Weinsberg',
  westfalia: 'Westfalia',
  // X
  xgo: 'XGO', 'x g o': 'XGO', 'x-g-o': 'XGO',
};

// âââ MODÃLES PAR MARQUE âââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Format : { pattern: string|RegExp, label: string, brand?: string }
// pattern est cherchÃ© dans le texte normalisÃ© aprÃ¨s conversion des nombres parlÃ©s
const MODELS = [
  // ADRIA Twin/Van
  { p: 'twin sf', l: 'Twin SF' }, { p: 'twin shx', l: 'Twin SHX' },
  { p: 'twin sl', l: 'Twin SL' }, { p: 'twin 540 spt', l: 'Twin 540 SPT' },
  { p: 'twin 600 spt', l: 'Twin 600 SPT' }, { p: 'twin 600 spb', l: 'Twin 600 SPB' },
  { p: 'twin 600 sp', l: 'Twin 600 SP' }, { p: 'twin 640 sgx', l: 'Twin 640 SGX' },
  { p: 'twin 640 slb', l: 'Twin 640 SLB' }, { p: 'twin 640 slx', l: 'Twin 640 SLX' },
  { p: 'twin 640 sl', l: 'Twin 640 SL' }, { p: 'twin axess 600 sp', l: 'Twin Axess 600 SP' },
  { p: 'twin plus 600 sp', l: 'Twin Plus 600 SP' }, { p: 'twin plus 640 sgx', l: 'Twin Plus 640 SGX' },
  { p: 'twin sports 600 spb', l: 'Twin Sports 600 SPB' }, { p: 'twin supreme 640 sgx', l: 'Twin Supreme 640 SGX' },
  { p: 'twin max', l: 'Twin Max' }, { p: 'twin', l: 'Twin' },
  { p: 'active supreme', l: 'Active Supreme' }, { p: 'active pro', l: 'Active Pro' }, { p: 'active', l: 'Active' },
  // ADRIA Compact
  { p: 'compact sc plus', l: 'Compact SC Plus' }, { p: 'compact sc', l: 'Compact SC' },
  { p: 'compact dl plus', l: 'Compact DL Plus' }, { p: 'compact dl', l: 'Compact DL' },
  { p: 'compact spx', l: 'Compact SPX' }, { p: 'compact sp', l: 'Compact SP' },
  // ADRIA Matrix
  { p: 'matrix supreme 677 sc', l: 'Matrix Supreme 677 SC' }, { p: 'matrix supreme 670 dc', l: 'Matrix Supreme 670 DC' },
  { p: 'matrix plus 670 dc', l: 'Matrix Plus 670 DC' }, { p: 'matrix axess 670 dc', l: 'Matrix Axess 670 DC' },
  { p: 'matrix axess 680 sl', l: 'Matrix Axess 680 SL' }, { p: 'matrix 670 dc', l: 'Matrix 670 DC' },
  { p: 'matrix 670 sc', l: 'Matrix 670 SC' }, { p: 'matrix 680 sl', l: 'Matrix 680 SL' },
  // ADRIA Coral
  { p: 'coral supreme 670 sc', l: 'Coral Supreme 670 SC' }, { p: 'coral axess 670 sc', l: 'Coral Axess 670 SC' },
  { p: 'coral 670 dc', l: 'Coral 670 DC' }, { p: 'coral 670 sc', l: 'Coral 670 SC' },
  { p: 'coral 680 sp', l: 'Coral 680 SP' }, { p: 'coral 690 sc', l: 'Coral 690 SC' },
  { p: 'corrale', l: 'Coral' }, { p: 'coral', l: 'Coral' },
  // ADRIA Sonic
  { p: 'sonic plus 700 dc', l: 'Sonic Plus 700 DC' }, { p: 'supersonic 780 dc', l: 'Supersonic 780 DC' },
  { p: 'sonic axess 600 sc', l: 'Sonic Axess 600 SC' }, { p: 'sonic 700 dc', l: 'Sonic 700 DC' },
  { p: 'sonic 700 sc', l: 'Sonic 700 SC' }, { p: 'sonnique', l: 'Sonic' }, { p: 'sonic', l: 'Sonic' },
  // AUTOSTAR
  { p: 'passion p680 lc', l: 'Passion P680 LC' }, { p: 'passion p690 lc', l: 'Passion P690 LC' },
  { p: 'passion p720 lc', l: 'Passion P720 LC' }, { p: 'passion i690 lc', l: 'Passion I690 LC' },
  { p: 'passion i720 lc', l: 'Passion I720 LC' }, { p: 'passion i730 lc', l: 'Passion I730 LC' },
  { p: 'privilege i690 lc', l: 'Privilege I690 LC' }, { p: 'privilege i720 lc', l: 'Privilege I720 LC' },
  { p: 'prestige i693 lc', l: 'Prestige I693 LC' }, { p: 'prestige i720 lc', l: 'Prestige I720 LC' },
  { p: 'performance p600', l: 'Performance P600' }, { p: 'performance p650', l: 'Performance P650 LT' },
  { p: 'van v590 lt', l: 'Van V590 LT' }, { p: 'van v630', l: 'Van V630 G' },
  // BAVARIA
  { p: 'k540g', l: 'K540G' }, { p: 'k600g', l: 'K600G' }, { p: 'k600j', l: 'K600J' },
  { p: 'k630g', l: 'K630G' }, { p: 'k630j', l: 'K630J' }, { p: 'k633m', l: 'K633M' },
  { p: 'i600l', l: 'I600L' }, { p: 'i650c', l: 'I650C' }, { p: 'i690d', l: 'I690D' },
  { p: 'i700c', l: 'I700C' }, { p: 'i720fc', l: 'I720FC' }, { p: 'i740c', l: 'I740C' },
  { p: 't626d', l: 'T626D' }, { p: 't650c', l: 'T650C' }, { p: 't696d', l: 'T696D' },
  { p: 't720fc', l: 'T720FC' }, { p: 't740c', l: 'T740C' },
  // BÃRSTNER
  { p: 'city car c540', l: 'City Car C540' }, { p: 'city car c600', l: 'City Car C600' },
  { p: 'campeo td 590g', l: 'Campeo TD 590G' }, { p: 'campeo c540', l: 'Campeo C540' },
  { p: 'campeo c600', l: 'Campeo C600' }, { p: 'campeo c640', l: 'Campeo C640' },
  { p: 'lyseo td 590', l: 'Lyseo TD 590' }, { p: 'lyseo td 644g', l: 'Lyseo TD 644G' },
  { p: 'lyseo td 680g', l: 'Lyseo TD 680G' }, { p: 'lyseo td 732', l: 'Lyseo TD 732' },
  { p: 'lyseo td 744', l: 'Lyseo TD 744' }, { p: 'lyseo t690g', l: 'Lyseo T690G' },
  { p: 'lyseo t700', l: 'Lyseo T700' }, { p: 'lyseo t734', l: 'Lyseo T734' },
  { p: 'liseo', l: 'Lyseo' }, { p: 'lyseo', l: 'Lyseo' },
  { p: 'nexxo t569', l: 'Nexxo T569' }, { p: 'nexxo t660', l: 'Nexxo T660' },
  { p: 'nexxo t685', l: 'Nexxo T685' }, { p: 'nexxo t700', l: 'Nexxo T700' },
  { p: 'nexo', l: 'Nexxo' }, { p: 'nexxo', l: 'Nexxo' },
  { p: 'ixeo time it590', l: 'Ixeo Time IT590' }, { p: 'ixeo time it695', l: 'Ixeo Time IT695' },
  { p: 'ixeo it634', l: 'Ixeo IT634' }, { p: 'ixeo it664', l: 'Ixeo IT664' },
  { p: 'ixeo it710g', l: 'Ixeo IT710G' }, { p: 'ixeo it734', l: 'Ixeo IT734' },
  { p: 'ixeo', l: 'Ixeo' }, { p: 'ixeo', l: 'Ixeo' },
  { p: 'aviano i690g', l: 'Aviano I690G' }, { p: 'aviano i700', l: 'Aviano I700' },
  { p: 'avyano', l: 'Aviano' }, { p: 'aviano', l: 'Aviano' },
  { p: 'viseo i670g', l: 'Viseo I670G' }, { p: 'viseo i690g', l: 'Viseo I690G' },
  { p: 'elegance i695g', l: 'Elegance I695G' }, { p: 'elegance i745', l: 'Elegance I745' },
  { p: 'travel van t590g', l: 'Travel Van T590G' }, { p: 'travel van t620g', l: 'Travel Van T620G' },
  // CARADO
  { p: 't132', l: 'T132' }, { p: 't135', l: 'T135' }, { p: 't337', l: 'T337' },
  { p: 't338', l: 'T338' }, { p: 't459', l: 'T459' }, { p: 't461', l: 'T461' },
  { p: 't462', l: 'T462' }, { p: 't467', l: 'T467' },
  { p: 'a132', l: 'A132' }, { p: 'a225', l: 'A225' }, { p: 'a362', l: 'A362' },
  { p: 'v132', l: 'V132' }, { p: 'v337', l: 'V337' }, { p: 'v601', l: 'V601' },
  { p: 'v602', l: 'V602' }, { p: 'v632', l: 'V632' }, { p: 'v641', l: 'V641' },
  // CHALLENGER
  { p: 'vany v114 max', l: 'Vany V114 Max' }, { p: 'vany v117 cs', l: 'Vany V117 CS' },
  { p: 'vany v114', l: 'Vany V114' }, { p: 'vany 02', l: 'Vany 02' }, { p: 'vany 03', l: 'Vany 03' },
  { p: 'genesis 388 eb', l: 'Genesis 388 EB' }, { p: 'genesis 398 eb', l: 'Genesis 398 EB' },
  { p: 'graphite 358 eb', l: 'Graphite 358 EB' }, { p: 'graphite 388 eb', l: 'Graphite 388 EB' },
  { p: 'grafite', l: 'Graphite' }, { p: 'graphite', l: 'Graphite' },
  { p: 'mageo 119 eb', l: 'Mageo 119 EB' }, { p: 'mageo 288 eb', l: 'Mageo 288 EB' },
  { p: 'mageo 398 xlb', l: 'Mageo 398 XLB' }, { p: 'majeoh', l: 'Mageo' }, { p: 'mageo', l: 'Mageo' },
  { p: 'sirius 2060', l: 'Sirius 2060' }, { p: 'sirius 2088', l: 'Sirius 2088' },
  { p: 'sirius 3048', l: 'Sirius 3048' }, { p: 'sirius 3078 xlb', l: 'Sirius 3078 XLB' },
  { p: 'siriuss', l: 'Sirius' }, { p: 'sirius', l: 'Sirius' },
  { p: 'quartz 274 eb', l: 'Quartz 274 EB' }, { p: 'quartz 288 eb', l: 'Quartz 288 EB' },
  { p: 'kouartz', l: 'Quartz' }, { p: 'quartz', l: 'Quartz' },
  { p: 'genese', l: 'Genesis' }, { p: 'genesis', l: 'Genesis' },
  // CHAUSSON
  { p: 'twist v594 max', l: 'Twist V594 Max' }, { p: 'twist v594s', l: 'Twist V594S' },
  { p: 'twist v594', l: 'Twist V594' }, { p: 'twist v690', l: 'Twist V690' },
  { p: 'twist v697', l: 'Twist V697' },
  { p: 'flash 628 eb', l: 'Flash 628 EB' }, { p: 'flash 718 eb', l: 'Flash 718 EB' },
  { p: 'flash 728 eb', l: 'Flash 728 EB' }, { p: 'flash 788 titanium', l: 'Flash 788 Titanium' },
  { p: 'flash 788', l: 'Flash 788' }, { p: 'flash 640 titanium', l: 'Flash 640 Titanium' },
  { p: 'flash 640', l: 'Flash 640' }, { p: 'flash 630', l: 'Flash 630' },
  { p: 'welcome 718 eb', l: 'Welcome 718 EB' }, { p: 'welcome 728 eb', l: 'Welcome 728 EB' },
  { p: 'welcome 747 ga', l: 'Welcome 747 GA' }, { p: 'welcome 778', l: 'Welcome 778' },
  { p: 'exaltis 7038 xlb', l: 'Exaltis 7038 XLB' }, { p: 'exaltis 7047 ga', l: 'Exaltis 7047 GA' },
  { p: 'exaltis 6010', l: 'Exaltis 6010' }, { p: 'exaltis 7068', l: 'Exaltis 7068' },
  { p: 'v594 max', l: 'V594 Max' }, { p: 'v594s', l: 'V594S' }, { p: 'v594', l: 'V594' },
  { p: 'v697', l: 'V697' }, { p: 'v690', l: 'V690' },
  { p: 's514', l: 'S514' }, { p: 's614', l: 'S614' }, { p: 's695', l: 'S695' }, { p: 's697 ga', l: 'S697 GA' },
  // DETHLEFFS
  { p: 'globebus t4', l: 'Globebus T4' }, { p: 'globebus t6', l: 'Globebus T6' },
  { p: 'globebus i3', l: 'Globebus I3' }, { p: 'globebus i4', l: 'Globebus I4' },
  { p: 'globetrail 600 dr', l: 'Globetrail 600 DR' }, { p: 'globetrail 640 hr', l: 'Globetrail 640 HR' },
  { p: 'just camp', l: 'Just Camp' }, { p: 'just go', l: 'Just Go' },
  { p: 'yoka go', l: 'Yoka Go' },
  // FLEURETTE
  { p: 'migrateur 60 lg', l: 'Migrateur 60 LG' }, { p: 'migrateur 63 lg', l: 'Migrateur 63 LG' },
  { p: 'migrateur 65 lbm', l: 'Migrateur 65 LBM' }, { p: 'migrateur 68 lmc', l: 'Migrateur 68 LMC' },
  { p: 'migrateur 69 lm', l: 'Migrateur 69 LM' }, { p: 'migrateur 70 lbm', l: 'Migrateur 70 LBM' },
  { p: 'migrateur 73 ld', l: 'Migrateur 73 LD' }, { p: 'migrateur 73 lj', l: 'Migrateur 73 LJ' },
  { p: 'migrateure', l: 'Migrateur' }, { p: 'migrateur', l: 'Migrateur' },
  { p: 'magister 65 lbm', l: 'Magister 65 LBM' }, { p: 'magister 68 lm', l: 'Magister 68 LM' },
  { p: 'magister 70 ld', l: 'Magister 70 LD' }, { p: 'magister 70 lmf', l: 'Magister 70 LMF' },
  { p: 'magister 73 lms', l: 'Magister 73 LMS' }, { p: 'magister 74 lmf', l: 'Magister 74 LMF' },
  { p: 'magister 74', l: 'Magister 74' }, { p: 'magister', l: 'Magister' },
  { p: 'discover 65 lm', l: 'Discover 65 LM' }, { p: 'discover 69 lms', l: 'Discover 69 LMS' },
  { p: 'discover 70 lms', l: 'Discover 70 LMS' }, { p: 'discover 71 lmf', l: 'Discover 71 LMF' },
  { p: 'discover 73 lmf', l: 'Discover 73 LMF' }, { p: 'discover 74 lms', l: 'Discover 74 LMS' },
  { p: 'discover 75 lmf', l: 'Discover 75 LMF' },
  { p: 'discoverre', l: 'Discover' }, { p: 'discover', l: 'Discover' },
  // HOBBY
  { p: 'vantana de luxe k65 ft', l: 'Vantana De Luxe K65 FT' },
  { p: 'vantana k60 ft', l: 'Vantana K60 FT' }, { p: 'vantana k60', l: 'Vantana K60' },
  { p: 'vantana k65 ft', l: 'Vantana K65 FT' }, { p: 'vantana k65', l: 'Vantana K65' },
  { p: 'optima de luxe t65', l: 'Optima De Luxe T65' }, { p: 'optima premium t65', l: 'Optima Premium T65' },
  { p: 'ontour c680', l: 'Ontour C680' }, { p: 'ontour c700', l: 'Ontour C700' },
  // HYMER
  { p: 'b-starline 590', l: 'B-StarLine 590' }, { p: 'b-starline 680', l: 'B-StarLine 680' },
  { p: 'moderncomfort i580', l: 'ModernComfort I580' }, { p: 'moderncomfort i600', l: 'ModernComfort I600' },
  { p: 'moderncomfort i680', l: 'ModernComfort I680' }, { p: 'moderncomfort t580', l: 'ModernComfort T580' },
  { p: 'masterline i780', l: 'MasterLine I780' }, { p: 'masterline i790', l: 'MasterLine I790' },
  { p: 'exsis-i 474', l: 'Exsis-I 474' }, { p: 'exsis-i 504', l: 'Exsis-I 504' },
  { p: 'exsis-i 578', l: 'Exsis-I 578' }, { p: 'exsis-i 594', l: 'Exsis-I 594' },
  { p: 'exsis-i 688', l: 'Exsis-I 688' }, { p: 'exsis-i 698', l: 'Exsis-I 698' },
  { p: 'exsis-t 374', l: 'Exsis-T 374' }, { p: 'exsis-t 474', l: 'Exsis-T 474' },
  { p: 'exsis-t 580', l: 'Exsis-T 580' }, { p: 'exsis-t 598', l: 'Exsis-T 598' },
  { p: 'exsi', l: 'Exsis-T' }, { p: 'exsis', l: 'Exsis-T' },
  { p: 'tramp s685', l: 'Tramp S685' }, { p: 'tramp s695', l: 'Tramp S695' },
  { p: 'tramp 554', l: 'Tramp 554' }, { p: 'tramp 578', l: 'Tramp 578' },
  { p: 'tramp 585', l: 'Tramp 585' }, { p: 'tramp 594', l: 'Tramp 594' },
  { p: 'tramp 598', l: 'Tramp 598' }, { p: 'tramp 614', l: 'Tramp 614' },
  { p: 'tramp 654', l: 'Tramp 654' }, { p: 'tramp 685', l: 'Tramp 685' },
  { p: 'tramp 698', l: 'Tramp 698' }, { p: 'tramp', l: 'Tramp' },
  { p: 'ml-t 560', l: 'ML-T 560' }, { p: 'ml-t 570', l: 'ML-T 570' }, { p: 'ml-t 580', l: 'ML-T 580' },
  { p: 'ml-i 570', l: 'ML-I 570' }, { p: 'ml-i 580', l: 'ML-I 580' }, { p: 'ml-i 630', l: 'ML-I 630' },
  { p: 'duomobil 534', l: 'DuoMobil 534' }, { p: 'duomobil 634', l: 'DuoMobil 634' },
  { p: 'b504', l: 'B504' }, { p: 'b534', l: 'B534' }, { p: 'b554', l: 'B554' },
  { p: 'b578', l: 'B578' }, { p: 'b588', l: 'B588' }, { p: 'b594', l: 'B594' },
  { p: 'b598', l: 'B598' }, { p: 'b654 sl', l: 'B654 SL' }, { p: 'b678', l: 'B678' },
  { p: 'b690', l: 'B690' }, { p: 'b694', l: 'B694' }, { p: 'b698', l: 'B698' },
  { p: 'b708', l: 'B708' }, { p: 'b878 sl', l: 'B878 SL' },
  { p: 's520', l: 'S520' }, { p: 's585', l: 'S585' }, { p: 's680', l: 'S680' }, { p: 's685', l: 'S685' },
  // LAIKA
  { p: 'ecovip h 4109 ds', l: 'Ecovip H 4109 DS' },
  { p: 'ecovip 300', l: 'Ecovip 300' }, { p: 'ecovip 305', l: 'Ecovip 305' },
  { p: 'ecovip 412', l: 'Ecovip 412' }, { p: 'ecovip 512', l: 'Ecovip 512' },
  { p: 'ecovip 600', l: 'Ecovip 600' }, { p: 'ecovip 612', l: 'Ecovip 612' },
  { p: 'ecovip 645', l: 'Ecovip 645' }, { p: 'ecovip 690', l: 'Ecovip 690' },
  { p: 'eco-vip', l: 'Ecovip' }, { p: 'ecovip', l: 'Ecovip' },
  { p: 'kosmo 209', l: 'Kosmo 209' }, { p: 'kosmo 212', l: 'Kosmo 212' },
  { p: 'kosmo 409 l', l: 'Kosmo 409 L' }, { p: 'kosmo 509', l: 'Kosmo 509' },
  { p: 'kosmo 512', l: 'Kosmo 512' }, { p: 'kosmo 640', l: 'Kosmo 640' },
  { p: 'cozmo', l: 'Kosmo' }, { p: 'kosmo', l: 'Kosmo' },
  // LMC
  { p: 'innova', l: 'Innova' }, { p: 'cruiser', l: 'Cruiser' },
  { p: 'kokoon', l: 'Kokoon' }, { p: 'vivo', l: 'Vivo' },
  // MC LOUIS
  { p: 'glamys 365 g', l: 'Glamys 365 G' }, { p: 'glamys 323 g', l: 'Glamys 323 G' },
  { p: 'glamys 322', l: 'Glamys 322' }, { p: 'glamys 223', l: 'Glamys 223' },
  { p: 'glamys 222', l: 'Glamys 222' }, { p: 'glamiss', l: 'Glamys' }, { p: 'glamys', l: 'Glamys' },
  { p: 'mc4 367 g', l: 'MC4 367 G' }, { p: 'mc4 379', l: 'MC4 379' }, { p: 'mc4 881', l: 'MC4 881' },
  { p: 'nevis 379', l: 'Nevis 379' }, { p: 'nevis 868', l: 'Nevis 868' }, { p: 'nevis 881', l: 'Nevis 881' },
  { p: 'menfys van 3 s-line', l: 'Menfys Van 3 S-Line' }, { p: 'menfys van 3', l: 'Menfys Van 3' },
  { p: 'menfys van 4', l: 'Menfys Van 4' }, { p: 'menfys van 5', l: 'Menfys Van 5' },
  { p: 'menfys 7 lifestyle', l: 'Menfys 7 Lifestyle' },
  { p: 'menfiss', l: 'Menfys' }, { p: 'menfys', l: 'Menfys' },
  // PILOTE
  { p: 'v540g', l: 'V540G' }, { p: 'v600f', l: 'V600F' }, { p: 'v600g', l: 'V600G' },
  { p: 'v600j', l: 'V600J' }, { p: 'v630f', l: 'V630F' }, { p: 'v630g', l: 'V630G' },
  { p: 'v630j', l: 'V630J' }, { p: 'v633m', l: 'V633M' },
  { p: 'pacific p600', l: 'Pacific P600' }, { p: 'pacific p626d', l: 'Pacific P626D' },
  { p: 'pacific p650c', l: 'Pacific P650C' }, { p: 'pacific p696d', l: 'Pacific P696D' },
  { p: 'pacific p700c', l: 'Pacific P700C' }, { p: 'pacific p740c', l: 'Pacific P740C' },
  { p: 'pacific p746c', l: 'Pacific P746C' }, { p: 'pacifique', l: 'Pacific' }, { p: 'pacific', l: 'Pacific' },
  { p: 'galaxy g600', l: 'Galaxy G600' }, { p: 'galaxy g650c', l: 'Galaxy G650C' },
  { p: 'galaxy g690c', l: 'Galaxy G690C' }, { p: 'galaxy g700c', l: 'Galaxy G700C' },
  { p: 'galaxy g740c', l: 'Galaxy G740C' }, { p: 'galaxy g741c', l: 'Galaxy G741C' },
  { p: 'galaxi', l: 'Galaxy' }, { p: 'galaxy', l: 'Galaxy' },
  { p: 'atlas a603g', l: 'Atlas A603G' }, { p: 'atlas a656d', l: 'Atlas A656D' },
  { p: 'atlas a690g', l: 'Atlas A690G' }, { p: 'atlas a696g', l: 'Atlas A696G' },
  // PÃSSL
  { p: 'summit 600', l: 'Summit 600' }, { p: 'summit 640', l: 'Summit 640' },
  { p: 'sommet', l: 'Summit' }, { p: 'summit', l: 'Summit' },
  { p: 'campster', l: 'Campster' }, { p: 'camp-stere', l: 'Campster' },
  { p: 'vanster', l: 'Vanster' },
  { p: 'roadcamp r', l: 'Roadcamp R' }, { p: 'road camp', l: 'Roadcamp' }, { p: 'roadcamp', l: 'Roadcamp' },
  { p: '2win 540', l: '2WIN 540' }, { p: '2win 640', l: '2WIN 640' },
  { p: 'duett 540', l: 'Duett 540' }, { p: 'duett 590', l: 'Duett 590' },
  // RAPIDO
  { p: 'van v43', l: 'Van V43' }, { p: 'van v53', l: 'Van V53' }, { p: 'van v55', l: 'Van V55' },
  { p: 'van v62', l: 'Van V62' }, { p: 'van v65 xl', l: 'Van V65 XL' }, { p: 'van v68', l: 'Van V68' },
  { p: '9096 df', l: '9096 DF' }, { p: '9090 df', l: '9090 DF' }, { p: '9076 df', l: '9076 DF' },
  { p: '9066 df', l: '9066 DF' }, { p: '9060 df', l: '9060 DF' },
  { p: '8096 df', l: '8096 DF' }, { p: '8090 df', l: '8090 DF' }, { p: '8086 df', l: '8086 DF' },
  { p: '8080 df', l: '8080 DF' }, { p: '8066 df', l: '8066 DF' },
  { p: '10001', l: '10001' }, { p: '10000', l: '10000' },
  { p: 'distinction i196m', l: 'Distinction i196M' }, { p: 'distinction i190', l: 'Distinction I190' },
  { p: 'distinction i96', l: 'Distinction i96' }, { p: 'distinction i90', l: 'Distinction I90' },
  { p: 'distinctionne', l: 'Distinction' }, { p: 'distinction', l: 'Distinction' },
  { p: '896 f', l: '896 F' }, { p: '891 f', l: '891 F' }, { p: '890 f', l: '890 F' },
  { p: '886 f', l: '886 F' }, { p: '881 f', l: '881 F' }, { p: '880 f', l: '880 F' },
  { p: '856 f', l: '856 F' }, { p: '855 f', l: '855 F' }, { p: '854 f', l: '854 F' },
  { p: '850 f', l: '850 F' }, { p: '840 f', l: '840 F' },
  { p: '796 f', l: '796 F' }, { p: '791 df', l: '791 DF' }, { p: '786 f', l: '786 F' },
  { p: '776', l: '776' }, { p: '7096 df', l: '7096 DF' }, { p: '7091 ff', l: '7091 FF' },
  { p: '7090 df', l: '7090 DF' }, { p: '7086 c', l: '7086 C' }, { p: '7076 df', l: '7076 DF' },
  // ROLLER TEAM
  { p: 'kronos go 265 tl', l: 'Kronos Go 265 TL' }, { p: 'kronos go 274 tl', l: 'Kronos Go 274 TL' },
  { p: 'kronos go 285 tl', l: 'Kronos Go 285 TL' }, { p: 'kronos go 291 tl', l: 'Kronos Go 291 TL' },
  { p: 'kronos 230 tl', l: 'Kronos 230 TL' }, { p: 'kronos 261 tl', l: 'Kronos 261 TL' },
  { p: 'kronos 262 tl', l: 'Kronos 262 TL' }, { p: 'kronos 263 tl', l: 'Kronos 263 TL' },
  { p: 'kronos 265 tl', l: 'Kronos 265 TL' }, { p: 'kronos 266 tl', l: 'Kronos 266 TL' },
  { p: 'kronos 274 tl', l: 'Kronos 274 TL' }, { p: 'kronos 279 m', l: 'Kronos 279 M' },
  { p: 'kronoss', l: 'Kronos' }, { p: 'kronos', l: 'Kronos' },
  { p: 'zefiro 265 tl', l: 'Zefiro 265 TL' }, { p: 'zefiro 266 tl', l: 'Zefiro 266 TL' },
  { p: 'zefiro 267 mh', l: 'Zefiro 267 MH' }, { p: 'zefiro 269 tl', l: 'Zefiro 269 TL' },
  { p: 'zefiro 277 tl', l: 'Zefiro 277 TL' }, { p: 'zefiro 285 tl', l: 'Zefiro 285 TL' },
  { p: 'zefiro', l: 'Zefiro' },
  { p: 't-line 255 s', l: 'T-Line 255 S' }, { p: 't-line xl s', l: 'T-Line XL S' },
  { p: 't-line garage', l: 'T-Line Garage' }, { p: 't-line 255', l: 'T-Line 255' },
  { p: 'teline', l: 'T-Line' }, { p: 't-line', l: 'T-Line' },
  { p: 'livingstone 2 maxi', l: 'Livingstone 2 Maxi' }, { p: 'livingstone 2', l: 'Livingstone 2' },
  { p: 'livingstone 5 sport', l: 'Livingstone 5 Sport' }, { p: 'livingstone 5', l: 'Livingstone 5' },
  { p: 'livingstonne', l: 'Livingstone' }, { p: 'livingstone', l: 'Livingstone' },
  { p: 'granduca 265 tl', l: 'Granduca 265 TL' }, { p: 'granduca 266 tl', l: 'Granduca 266 TL' },
];

// âââ MOTORISATIONS ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const ENGINES = [
  { keys: ['ducato', '2.8', '127'], label: 'Fiat Ducato 2.8L 127ch' },
  { keys: ['ducato', '2.8', '146'], label: 'Fiat Ducato 2.8L 146ch' },
  { keys: ['ducato', '2.3', '120'], label: 'Fiat Ducato 2.3L 120ch' },
  { keys: ['ducato', '2.3', '130'], label: 'Fiat Ducato 2.3L 130ch' },
  { keys: ['ducato', '2.3', '140'], label: 'Fiat Ducato 2.3L 140ch' },
  { keys: ['ducato', '2.3', '150'], label: 'Fiat Ducato 2.3L 150ch' },
  { keys: ['ducato', '2.3', '160'], label: 'Fiat Ducato 2.3L 160ch' },
  { keys: ['ducato', '2.3', '180'], label: 'Fiat Ducato 2.3L 180ch' },
  { keys: ['ducato', '2.2', '140'], label: 'Fiat Ducato 2.2L 140ch' },
  { keys: ['ducato', '2.2', '160'], label: 'Fiat Ducato 2.2L 160ch' },
  { keys: ['ducato', '2.2', '180'], label: 'Fiat Ducato 2.2L 180ch' },
  { keys: ['jumper', '2.2', '120'], label: 'CitroÃ«n Jumper 2.2L 120ch' },
  { keys: ['jumper', '2.2', '140'], label: 'CitroÃ«n Jumper 2.2L 140ch' },
  { keys: ['jumper', '2.2', '165'], label: 'CitroÃ«n Jumper 2.2L 165ch' },
  { keys: ['boxer', '2.2', '120'], label: 'Peugeot Boxer 2.2L 120ch' },
  { keys: ['boxer', '2.2', '140'], label: 'Peugeot Boxer 2.2L 140ch' },
  { keys: ['boxer', '2.2', '165'], label: 'Peugeot Boxer 2.2L 165ch' },
  { keys: ['transit custom', '2.0', '105'], label: 'Ford Transit Custom 2.0L 105ch' },
  { keys: ['transit custom', '2.0', '130'], label: 'Ford Transit Custom 2.0L 130ch' },
  { keys: ['transit custom', '2.0', '170'], label: 'Ford Transit Custom 2.0L 170ch' },
  { keys: ['transit', '2.2', '100'], label: 'Ford Transit 2.2L 100ch' },
  { keys: ['transit', '2.2', '125'], label: 'Ford Transit 2.2L 125ch' },
  { keys: ['transit', '2.2', '140'], label: 'Ford Transit 2.2L 140ch' },
  { keys: ['transit', '2.2', '155'], label: 'Ford Transit 2.2L 155ch' },
  { keys: ['transit', '2.0', '130'], label: 'Ford Transit 2.0L 130ch' },
  { keys: ['transit', '2.0', '150'], label: 'Ford Transit 2.0L 150ch' },
  { keys: ['transit', '2.0', '170'], label: 'Ford Transit 2.0L 170ch' },
  { keys: ['master', '2.3', '110'], label: 'Renault Master 2.3L 110ch' },
  { keys: ['master', '2.3', '125'], label: 'Renault Master 2.3L 125ch' },
  { keys: ['master', '2.3', '145'], label: 'Renault Master 2.3L 145ch' },
  { keys: ['master', '2.3', '163'], label: 'Renault Master 2.3L 163ch' },
  { keys: ['master', '2.3', '180'], label: 'Renault Master 2.3L 180ch' },
  { keys: ['talento', '1.6', '125'], label: 'Renault Talento 1.6L 125ch' },
  { keys: ['talento', '1.6', '145'], label: 'Renault Talento 1.6L 145ch' },
  { keys: ['sprinter', '2.2', '114'], label: 'Mercedes Sprinter 2.2L 114ch' },
  { keys: ['sprinter', '2.2', '143'], label: 'Mercedes Sprinter 2.2L 143ch' },
  { keys: ['sprinter', '2.2', '163'], label: 'Mercedes Sprinter 2.2L 163ch' },
  { keys: ['sprinter', '2.2', '177'], label: 'Mercedes Sprinter 2.2L 177ch' },
  { keys: ['sprinter', '3.0', '190'], label: 'Mercedes Sprinter 3.0L 190ch' },
  { keys: ['sprinter', '3.0', '211'], label: 'Mercedes Sprinter 3.0L 211ch' },
  { keys: ['sprinter', '3.0', '224'], label: 'Mercedes Sprinter 3.0L 224ch' },
  { keys: ['sprinter', '2.0', '114'], label: 'Mercedes Sprinter 2.0L 114ch' },
  { keys: ['sprinter', '2.0', '143'], label: 'Mercedes Sprinter 2.0L 143ch' },
  { keys: ['sprinter', '2.0', '170'], label: 'Mercedes Sprinter 2.0L 170ch' },
  { keys: ['classe v', '2.2', '136'], label: 'Mercedes Classe V 2.2L 136ch' },
  { keys: ['classe v', '2.2', '163'], label: 'Mercedes Classe V 2.2L 163ch' },
  { keys: ['classe v', '3.0', '190'], label: 'Mercedes Classe V 3.0L 190ch' },
  { keys: ['crafter', '2.0', '102'], label: 'Volkswagen Crafter 2.0L 102ch' },
  { keys: ['crafter', '2.0', '122'], label: 'Volkswagen Crafter 2.0L 122ch' },
  { keys: ['crafter', '2.0', '140'], label: 'Volkswagen Crafter 2.0L 140ch' },
  { keys: ['crafter', '2.0', '163'], label: 'Volkswagen Crafter 2.0L 163ch' },
  { keys: ['crafter', '2.0', '177'], label: 'Volkswagen Crafter 2.0L 177ch' },
  { keys: ['transporter', '2.0', '84'], label: 'Volkswagen Transporter T6 2.0L 84ch' },
  { keys: ['transporter', '2.0', '102'], label: 'Volkswagen Transporter T6 2.0L 102ch' },
  { keys: ['transporter', '2.0', '150'], label: 'Volkswagen Transporter T6 2.0L 150ch' },
  { keys: ['transporter', '2.0', '204'], label: 'Volkswagen Transporter T6 2.0L 204ch' },
  { keys: ['iveco', '3.0', '180'], label: 'Iveco Daily 3.0L 180ch' },
  { keys: ['iveco', '3.0', '205'], label: 'Iveco Daily 3.0L 205ch' },
  { keys: ['iveco', '3.0', '210'], label: 'Iveco Daily 3.0L 210ch' },
  { keys: ['iveco', '2.3', '116'], label: 'Iveco Daily 2.3L 116ch' },
  { keys: ['iveco', '2.3', '136'], label: 'Iveco Daily 2.3L 136ch' },
  { keys: ['daily', '3.0', '180'], label: 'Iveco Daily 3.0L 180ch' },
  { keys: ['daily', '2.3', '116'], label: 'Iveco Daily 2.3L 116ch' },
  { keys: ['tge', '2.0', '102'], label: 'MAN TGE 2.0L 102ch' },
  { keys: ['tge', '2.0', '140'], label: 'MAN TGE 2.0L 140ch' },
  { keys: ['tge', '2.0', '177'], label: 'MAN TGE 2.0L 177ch' },
  { keys: ['proace', '2.0', '122'], label: 'Toyota Proace 2.0L 122ch' },
  { keys: ['proace', '2.0', '145'], label: 'Toyota Proace 2.0L 145ch' },
];

const BASE_VEHICLES = [
  { keys: ['ducato'], label: 'Fiat Ducato' },
  { keys: ['jumper'], label: 'CitroÃ«n Jumper' },
  { keys: ['boxer'], label: 'Peugeot Boxer' },
  { keys: ['transit custom'], label: 'Ford Transit Custom' },
  { keys: ['transit'], label: 'Ford Transit' },
  { keys: ['master'], label: 'Renault Master' },
  { keys: ['talento'], label: 'Renault Talento' },
  { keys: ['sprinter'], label: 'Mercedes Sprinter' },
  { keys: ['classe v'], label: 'Mercedes Classe V' },
  { keys: ['crafter'], label: 'Volkswagen Crafter' },
  { keys: ['transporter'], label: 'Volkswagen Transporter T6' },
  { keys: ['iveco'], label: 'Iveco Daily' },
  { keys: ['daily'], label: 'Iveco Daily' },
  { keys: ['man tge'], label: 'MAN TGE' },
  { keys: ['tge'], label: 'MAN TGE' },
  { keys: ['proace'], label: 'Toyota Proace' },
];

function parseMotorisation(n) {
  const norm = n.replace(/,/g, '.');
  for (const engine of ENGINES) {
    if (engine.keys.every(k => norm.includes(k))) return engine.label;
  }
  const cylinder = norm.match(/(1\.6|2\.0|2\.2|2\.3|2\.8|3\.0)/)?.[0];
  const hp = norm.match(/(\d{2,3})\s*(ch|chevaux)/)?.[1];
  const auto = norm.includes('automatique') || norm.includes('bva') || norm.includes('boite auto') ? ' BVA' : '';
  for (const base of BASE_VEHICLES) {
    if (base.keys.every(k => norm.includes(k))) {
      const parts = [base.label, cylinder ? `${cylinder}L` : '', hp ? `${hp}ch` : ''].filter(Boolean);
      return parts.join(' ') + auto;
    }
  }
  if (cylinder || hp) {
    return [cylinder ? `${cylinder}L` : '', hp ? `${hp}ch` : ''].filter(Boolean).join(' ') + auto;
  }
  return '';
}

export function parseVehicle(text) {
  const n = normalize(text);
  const nd = spokenToDigits(text); // texte avec nombres convertis

  // Marque â chercher la plus longue clÃ© en premier
  const sortedBrands = Object.entries(BRANDS).sort((a, b) => b[0].length - a[0].length);
  const marque = sortedBrands.find(([key]) => n.includes(key))?.[1] || '';

  // ModÃ¨le â chercher dans le texte avec nombres convertis
  const modele = MODELS.find(({ p }) => nd.includes(normalize(p)))?.l || '';

  // Motorisation
  const motorisation = parseMotorisation(n);

  // Immatriculation
  const rawPlate = String(text).toUpperCase().replace(/[\s-]/g, '').match(/[A-Z]{2}\d{3}[A-Z]{2}/)?.[0] || '';
  const immat = rawPlate ? `${rawPlate.slice(0, 2)}-${rawPlate.slice(2, 5)}-${rawPlate.slice(5)}` : '';

  // Prix d'achat
  const prixAchat = n.match(/(?:achete|achete|achat|prix)\D{0,25}(\d[\d\s.]{2,})/)?.[1]?.replace(/\D/g, '') || '';

  // Cession Odoo
  const cessionOdoo = n.includes('pas de cession') || n.includes('sans cession') || n.includes('pas d odoo')
    ? '0'
    : n.match(/(?:cession|session|odoo|doux)\D{0,25}(\d[\d\s.]{1,})/)?.[1]?.replace(/\D/g, '') || '';

  // Commercial
  const sales = {
    thibault: 'Thibault', rager: 'Thibault',
    nadia: 'Nadia', faramin: 'Nadia',
    gerald: 'GÃ©rald', dd: 'GÃ©rald',
    malo: 'Malo', simon: 'Simon',
    ragot: 'Kevin R.', guesdon: 'Kevin G.'
  };
  const commercial = Object.entries(sales).find(([key]) => n.includes(key))?.[1] || '';

  return { marque, modele, motorisation, mec: parseDate(text), immat, prixAchat, cessionOdoo, commercial };
}

export function parseMechanics(text) {
  const n = normalize(text);
  return {
    prepEsthetique: n.includes('pas de prepa') || n.includes('sans nettoyage') ? 'NON' : 'OUI',
    ct: /\bct\b/.test(n) || n.includes('controle technique') ? 'OUI' : 'NON',
    vidangeSimple: n.includes('vidange') && !n.includes('complete') ? 'OUI' : 'NON',
    vidangeComplete: n.includes('vidange complete') ? 'OUI' : 'NON',
    courroie: n.includes('courroie') || n.includes('distribution') ? 'OUI' : 'NON',
    pneus: n.includes('deux pneus') || n.includes('2 pneus') || n.includes('train de pneus') ? 'OUI, 2' : n.includes('pneu') ? 'OUI, 1' : 'NON',
    batterie: n.includes('batterie') ? 'OUI' : 'NON',
    autresMeca: '0'
  };
}

export function parseLines(text, max) {
  const raw = clean(text);
  if (!raw || ['rien', 'neant', 'nÃ©ant', "vendu en l'etat", "vendu en l\u2019etat"].includes(normalize(raw))) return [];
  const lines = parseWorkLines(raw).slice(0, max);
  if (lines.length) return lines;
  return raw.split(/[,;\n.]+/).map(clean).filter(Boolean).slice(0, max)
    .map((desc) => ({ id: `${Date.now()}-${Math.random()}`, desc, amount: '' }));
}

function parseWorkLines(raw) {
  const chunks = raw.split(/[,;\n.]+/).map(clean).filter(Boolean);
  const lines = [];
  let pendingParts = [];
  for (const chunk of chunks) {
    const extracted = extractAmount(chunk);
    if (extracted.amount) {
      if (extracted.desc) pendingParts.push(extracted.desc);
      const desc = clean(pendingParts.join(' '));
      if (desc) {
        lines.push({ id: `${Date.now()}-${Math.random()}`, desc, amount: extracted.amount });
      } else if (lines.length) {
        lines[lines.length - 1].amount = extracted.amount;
      }
      pendingParts = [];
    } else {
      pendingParts.push(chunk);
    }
  }
  if (pendingParts.length) {
    lines.push({ id: `${Date.now()}-${Math.random()}`, desc: clean(pendingParts.join(' ')), amount: '' });
  }
  return lines;
}

function extractAmount(text) {
  const original = clean(text);
  const n = normalize(original);
  const numeric = original.match(/^(.*?)(\d[\d\s.]*)\s*(euros?|â¬)\s*$/i);
  if (numeric) {
    return { desc: clean(numeric[1]).replace(/[,:;-]\s*$/, ''), amount: numeric[2].replace(/\D/g, '') };
  }
  if (!n.includes('euro')) return { desc: original, amount: '' };
  const beforeEuro = clean(original.replace(/euros?{â¬/gi, ''));
  const directAmount = frenchNumberToInt(beforeEuro);
  if (directAmount !== null) return { desc: '', amount: String(directAmount) };
  const words = beforeEuro.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const maybeAmount = words.slice(i).join(' ');
    const value = frenchNumberToInt(maybeAmount);
    if (value !== null) {
      return { desc: clean(words.slice(0, i).join(' ')).replace(/[,:;-]\s*$/, ''), amount: String(value) };
    }
  }
  return { desc: original, amount: '' };
}

function frenchNumberToInt(text) {
  const n = normalize(text).replace(/-/g, ' ').replace(/\bet\b/g, ' ').replace(/\bd['']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (/^\d+$/.test(n)) return Number(n);
  const units = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
  const tens = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  const special = {
    'dix sept': 17, 'dix huit': 18, 'dix neuf': 19,
    'soixante dix': 70, 'soixante onze': 71, 'soixante douze': 72, 'soixante treize': 73,
    'soixante quatorze': 74, 'soixante quinze': 75, 'soixante seize': 76,
    'soixante dix sept': 77, 'soixante dix huit': 78, 'soixante dix neuf': 79,
    'quatre vingt': 80, 'quatre vingts': 80, 'quatre vingt dix': 90,
    'quatre vingt onze': 91, 'quatre vingt douze': 92, 'quatre vingt treize': 93,
    'quatre vingt quatorze': 94, 'quatre vingt quinze': 95, 'quatre vingt seize': 96,
    'quatre vingt dix sept': 97, 'quatre vingt dix huit': 98, 'quatre vingt dix neuf': 99
  };
  if (special[n] !== undefined) return special[n];
  if (units[n] !== undefined) return units[n];
  if (tens[n] !== undefined) return tens[n];
  const words = n.split(' ');
  let total = 0, current = 0, seen = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (units[w] !== undefined) { current += units[w]; seen = true; }
    else if (tens[w] !== undefined) { current += tens[w]; seen = true; }
    else if (w === 'cent' || w === 'cents') { if (current === 0) current = 1; current *= 100; seen = true; }
    else if (w === 'mille') { if (current === 0) current = 1; total += current * 1000; current = 0; seen = true; }
    else {
      const rest = words.slice(i).join(' ');
      if (special[rest] !== undefined) { current += special[rest]; seen = true; break; }
      return null;
    }
  }
  return seen ? total + current : null;
}

export function surpriseAmount(mec) {
  if (!mec) return 0;
  const [d, m, y] = String(mec).split('/').map(Number);
  if (!d || !m || !y) return 0;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return 0;
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age <= 4) return 250;
  if (age <= 8) return 500;
  return 750;
}
