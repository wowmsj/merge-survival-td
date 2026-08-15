import type { LocaleData } from './types';
import { getAllBuildingConfigs } from '../config/BuildingConfig';
import { getAllHeroConfigs } from '../config/HeroConfig';
import { getAllProps, type IPropRow } from '../config/PropConfig';
import { STORY_BEATS } from '../config/StoryConfig';
import { getAllZombieConfigs } from '../config/ZombieConfig';

const SPEAKERS: Record<string, string> = {
  narrator: 'Narrator', hero: 'A-He', laogui: 'Old Ghost', xiaoman: 'Xiaoman', beian: 'Northbank',
  mancang: 'Mancang', laoqiang: 'Old Gun', pangshen: 'Aunt Pang', doctor: 'Dr. Bai',
  xiaodian: 'Xiaodian', douzi: 'Douzi', wensente: 'Vincent', tiezhua: 'Iron Claw', officer: 'Reclamation Officer'
};

export function translateEnglishSpeaker(who: string): string {
  const name = SPEAKERS[who];
  if (!name) throw new Error(`Missing English story speaker: ${who}`);
  return name;
}

const BUILDINGS: Record<number, string> = {
  1: 'Base Core', 101: 'Arrow Tower', 102: 'Cannon Tower', 103: 'Tesla Tower', 104: 'Frost Tower',
  202: 'Medical Station', 203: 'Wind Power Station', 204: 'Outpost', 205: 'Warehouse', 206: 'Workshop', 207: 'Collection Station',
  301: 'Spike Trap', 302: 'Land Mine', 303: 'Slow Bog', 401: 'Wooden Wall', 402: 'Stone Wall', 403: 'Iron Wall', 901: 'Ruins'
};
const HEROES: Record<string, string> = { xiaoman: 'Xiaoman', laoqiang: 'Old Gun', pangshen: 'Aunt Pang', doctor: 'Dr. Bai', xiaodian: 'Xiaodian', douzi: 'Douzi' };
const HERO_DESCRIPTIONS: Record<string, string> = {
  xiaoman: 'Fast and steady on the defensive line.', laoqiang: 'A veteran marksman who guards the inner zone.',
  pangshen: 'A tough cook who holds the line.', doctor: 'A field doctor who keeps the fortress standing.',
  xiaodian: 'A young engineer with a talent for power systems.', douzi: 'A sharp scout who knows every road.'
};
const CHARACTER_BIOS_EN: LocaleData['characterBios'] = {
  hero: { title: 'Heir of Fortress 7', bio: 'A Merge apprentice raised by her grandmother, carrying half of the Merge Core.' },
  mancang: { title: 'AI Raven', bio: 'An old AI left by your grandmother, sharp-tongued and full of encrypted logs.' },
  laogui: { title: 'Black Market Trader', bio: 'A well-connected trader who pays well for the supplies he needs.' },
  laoqiang: { title: 'Veteran Guard', bio: 'A quiet old soldier with an unerring shot and an untold past.' },
  pangshen: { title: 'Fortress Cook', bio: 'A practical cook whose hot meals keep the fortress alive.' },
  doctor: { title: 'Field Doctor', bio: 'A cool-headed doctor carrying secrets from an abandoned clinic.' },
  xiaodian: { title: 'Young Engineer', bio: 'A gifted fifteen-year-old who can rebuild almost anything.' },
  douzi: { title: 'Young Scavenger', bio: 'A quick child scout who knows the city better than anyone.' },
  xiaoman: { title: 'Volunteer', bio: 'A capable newcomer who came to help the fortress.' },
  beian: { title: 'Northbank Camp', bio: 'A survivor camp at the other end of the radio signal.' },
  tiezhua: { title: 'Neighboring Fortress Lord', bio: 'A hostile neighbor trying to seize the fortress.' },
  officer: { title: 'Steel Council Officer', bio: 'A Council officer with a polished smile and hidden motives.' },
  wensente: { title: 'Council Liaison', bio: 'A courteous Council envoy who keeps a close eye on Fortress 7.' }
};
const ZOMBIES: Record<number, string> = { 1: 'Walker', 2: 'Runner', 3: 'Tank Zombie', 4: 'Bomber Zombie', 5: 'Elite Zombie', 6: 'Boss Zombie', 7: 'Flying Zombie', 8: 'Burrowing Zombie' };

const PROP_NAMES: Record<number, string> = {
  101: 'Coin', 102: 'Diamond', 103: 'Energy', 104: 'Experience', 105: 'Star', 106: 'Style Points', 107: 'Renminbi', 108: 'US Dollar',
  201: 'Single Coin', 202: 'Small Coin Pile', 203: 'Coin Bundle', 204: 'Coin Stack', 205: 'Coin Hoard', 206: 'Diamond Chip', 207: 'Diamond Pouch', 208: 'Diamond Cache', 209: 'Diamond Trove', 210: 'Energy', 211: 'Coin Trove',
  301: 'Green Star XP', 302: 'Experience', 303: 'Experience Pack', 304: 'Experience Cache', 305: 'Style Voucher', 306: 'Lucky Grab Bag', 401: 'Backpack',
  801: 'Energy Spark', 802: 'Energy Pack', 803: 'Energy Bundle', 804: 'Energy Cache', 805: 'Energy Trove', 806: 'Small Emergency Power Supply', 807: 'Small Charging Station', 808: 'Small Disassembler', 809: 'Small Overclocker', 901: 'Bottle of Diamonds',
  1001: 'Coin Chest', 1002: 'Energy Chest', 1003: 'Blue Scavenger Bag', 1004: 'Large Blue Scavenger Bag', 1005: 'Black Scavenger Bag', 1006: 'Large Black Scavenger Bag', 1007: 'Tin Piggy Bank', 1008: 'Medium Tin Piggy Bank', 1009: 'Large Tin Piggy Bank', 1010: 'Supply Airdrop',
  2001: 'Simple Toolbox', 2002: 'Tool Seed Box', 2003: 'Military Supply Crate', 2004: 'Cold-Storage Toolbox', 2005: 'Plant Supply', 2006: 'Military Supply', 2007: 'Material Supply', 2008: 'Water Supply', 2009: 'Skill Supply', 2010: 'Scrap Recovery'
};

const PROP_GROUPS: Array<[number[], string[]]> = [
  [[10001,10002,10003,10004,10005,10006,10007,10008,10009,10010,10011], ['Toolbox Handle','Old Box Lid','Empty Crate','Hardware Box','Old Toolbox','Scavenged Toolbox','Professional Toolbox','Double-Decker Toolbox','Repair Kit','Multitool Box','Repair Workbench']],
  [[10012,10013,10014,10015,10016,10017,10018,10019,10020,10021,10022,10023,10024,10025,10026,10027,10028], ['Screwdriver','Hammer','Hex Wrench','Nail Puller','Clamp','Carpenter Saw','Electrician Pliers','Power Drill','Polisher','Rivet Gun','Electric Saw','Pipe Wrench','Grinder','Pneumatic Tool','Single Glove','One Glove','Work Gloves']],
  [[20001,20002,20003,20004,20005,20006,20007,20008,20009,20010], ['Old Cooler','Portable Cooler','Mini Fridge','Refurbished Fridge','Old Refrigerator','Fresh-Keeping Fridge','Double-Layer Fridge','Reinforced Fridge','Large Refrigerator','Double-Door Cold Store']],
  [[20011,20012,20013,20014,20015,20016,20017,20018,20019,20020], ['Dirty Water','Settled Water','Boiled Water','Filtered Water','Distilled Water','Purified Water','Bottled Water','Electrolyte Water','Nutrition Drink','Canteen']],
  [[20021,20022,20023,20024,20025,20026,20027,20028,20029], ['Dry Bread','Hardtack','Compressed Biscuit','Canned Meat','Vacuum Ration','Alcohol Spray','Bandage','Painkiller','Medical Kit']],
  [[20030,20031,20032,20033,20034,20035,20036,20037,20038,20039,20040], ['Plastic Sheet','Bundle of Plastic Sheets','Old Plastic Basket','Odds-and-Ends Box','Scavenger Basket','Supply Cart','Light Cart','Construction Cart','Cargo Cart','Loaded Cart','Modified Forklift']],
  [[20041,20042,20043,20044,20045,20046,20047,20048,20049,20050,20051,20052,20053,20054,20055,20056,20057,20058], ['Rubber Strip','Old Rope Coil','Wire Coil','Iron Bracket','Scrap Wheel','Spring Coil','Tin Drum','Scrap Plate','Steel Frame','Steel Beam','Armored Steel Plate','Spring Part','Scrap Chunk','Iron Bar','Rebar Bundle','Steel Frame','Reinforced Steel Frame','Armor Plate']],
  [[20059,20060,20061,20062,20063,20064], ['Handwritten Notice','Hand-Crank Siren','Broken Radio','Fortress Radio','Shortwave Radio','Radio Transmission Tower']],
  [[20065,20066,20067,20068,20069,20070,20071,20072,20073,20074,20075,20076,20077], ['Fitness Manual','Endurance Manual','Tactics Manual','Elite Manual','Scavenging Basics','Search Techniques','Stealth Techniques','Brawling Techniques','Marksmanship Techniques','First Aid','Fortifications','Trap Making','Survival Mastery']],
  [[30001,30002,30003,30004,30005,30006,30007,30008], ['Old Wheel','Pair of Old Wheels','Old Cart Frame','Empty Cart','Scavenger Cart','Large Cart','Loaded Cart','Storage Basket']],
  [[30009,30010,30011,30012,30013,30014,30015,30016,30017,30018,30019,30020,30021,30022,30023], ['Drawer Part','Drawer Frame','Damaged Drawer','Storage Drawer','Double Storage Cabinet','Twin-Row Cabinet','Advanced Cabinet','Luxury Cabinet','Anti-Theft Cabinet','Sealed Cabinet','Key','Keyring','Sensor Key','Automatic Sensor Key','Access Wristband']],
  [[30024,30025,30026,30027,30028,30029,30030,30031,30032,30033,30034,30035,30036], ['Paper Scraps','Paper Shreds','Map Fragment','Joined Fragment','Small Map Piece','Large Map Piece','Map Corner','City Map','Half Map','Map Outline','Torn Map','Old World Map','Complete Cache Map']],
  [[30037,30038,30039,30040,30041,30042,30043,30044,30045,30046,30047,30048], ['Old Cloak','Broken Beaker','Lab Notes','Virus Sample','Leak Alarm','Empty Street Photo','Abandoned Hospital Key','Quarantine Pass','Patient Zero File','Researcher Encrypted Drive','Lab Log Fragment','The Truth About the Virus']],
  [[30049,30050,30051,30052,30053,30054], ['Lost Glasses','Lost Sunhat','Lost Boxing Glove','Lost-and-Found Basket','Large Lost-and-Found Basket','Lost-and-Found Office']],
  [[30055,30056,30057,30058,30059,30060,30061,30062,30063,30064,30065,30066], ['Old USB Drive','Old Mouse','Game Controller','Music Player','Bluetooth Earbuds','Projector','VR Goggles','Vintage Collection Box','Old Handheld Console','Portable Terminal','Data Terminal','Military Terminal']],
  [[30067,30068,30069,30070,30071], ['Supply Basket','Canvas Backpack','Expedition Pack','Loaded Pack','Explorer Backpack']],
  [[30072,30073,30074,30075,30076,30077,30078,30079,30080,30081,30082], ['Slingshot','Hunting Bow','Heavy Crossbow','Shotgun','Military Rifle','Bird Sprite','Bird Ranger','Bird Mage','Bird Hero','Bird Knight','Bird Princess']],
  [[40001,40002,40003,40004,40005,40006,40007,40008,40009,40010], ['Broken Flowerpot','Cracked Flowerpot','Damaged Flowerpot','Assembled Flowerpot','Clay Flowerpot','Fresh-Painted Pot','Empty Flowerpot','Potting-Soil Pot','Potted Seedling','Potted Plant']],
  [[40011,40012,40013,40014,40015,40016,40017,40018,40019,40020,40021,40022,40023,40024,40025,40026], ['Small Seed Pack','Extra Seed Pack','Large Seed Pack','Seed Pile','Empty Seed Bag','Small Seed Bag','Stack of Seed Bags','Heap of Seed Bags','Burlap','Sewing Cloth','Cloth Pouch','Canvas Backpack','Ballistic Lining','Homemade Vest','Reinforced Vest','Guard Heavy Armor']],
  [[40027,40028,40029,40030,40031,40032,40033,40034,40035,40036,40037,40038], ['Seeds','Greenhouse Seedling','Seedling','Green Plant','Money Tree','Flowering Tree','Mutant Larva','Hard-Shell Pupa','Mutant Insect','Glowing Moth','Red-Wing Moth','Mutant Moth Queen']],
  [[40039,40040,40041,40042,40043,40044,40045,40046,40047,40048,40049,40050,40051,40052,40053,40054,40055,40056], ['Vine Rope','Broken Grass Basket','Woven Basket','Rattan Basket','Small Medicine Basket','Large Medicine Basket','Victory Medicine Basket','Fine Medicine Basket','Luxury Medicine Basket','Wild Mugwort','Bottled Mugwort','Dried Mint','Mint Medicine Jar','Loose Herbs','Herbal Sachet','Selected Herbs','Bundled Herbs','First-Aid Case']],
  [[50001,50002,50003,50004,50005,50006,50007,50008,50009,50010], ['Battery','Enhanced Battery','CPU','Circuit Board','Old Robot','Sweeper Robot','Repair Robot','Welding Robot','Patrol Robot','Sentry Robot']],
  [[50011,50012,50013,50014,50015,50016,50017,50018,50019,50020,50021,50022,50036], ['Torn Wrapping Paper','Fish Bone','Drink Cup','Takeout Box','Scrap Box','Large Scrap Bag','Mutant Rat Pup','Mutant Rat','Mutant Fat Rat','Mutant Rat Pair','Mutant Rat Swarm','Cat Nest','Lab Rat Cage']],
  [[50023,50024,50025,50026,50027,50028,50029,50030,50031,50032,50033,50034,50035], ['Kitten Nest','Tabby Cat','Gray Kitten','Stylish Cat','Yellow Kitten','White Cat','Black Kitten','Gray Cat','Fat Cat','Bell Cat','Tiger Cat','Calico Cat','Little Kitty']],
  [[60001,60002,60003,60004,60005,60006,60007,60008,60009,60010,60011,60012,60013,60014,60015,60016,60017,60018,60019,60020,60021,60022,60023,60024,60025,60026,60027,60028,60029,60030,60031], ['Small Emergency Power Supply','Medium Emergency Power Supply','Large Emergency Power Supply','Overcharged Emergency Power Supply','Small Charging Station','Medium Charging Station','Large Charging Station','Small Disassembler','Medium Disassembler','Large Disassembler','Small Overclocker','Medium Overclocker','Large Overclocker','Heavy Overclocker','Extreme Overclocker','Tool Upgrade Chip','Refrigeration Upgrade Chip','Equipment Upgrade Chip','Super Upgrade Chip','Universal Upgrade Chip','Tactical Backpack','Old Pocket Watch','Strong Cleaner','Mysterious Part','Core Fragment','Core Base','Merge Core Prototype','TG-I Core','Merge Core Mk. II','Merge Core Mk. III','Complete Merge Core']]
];
for (const [ids, names] of PROP_GROUPS) ids.forEach((id, index) => { PROP_NAMES[id] = names[index]; });

const BLUEPRINT_TARGETS: Record<number, string> = { 1: 'Arrow Tower', 2: 'Cannon Tower', 3: 'Tesla Tower', 4: 'Frost Tower', 5: 'Farm', 6: 'Medical Station', 7: 'Power Station', 8: 'Housing', 9: 'Warehouse', 10: 'Workshop', 11: 'Collection Station', 12: 'Spike Trap', 13: 'Land Mine', 14: 'Slow Bog', 15: 'Wooden Wall', 16: 'Stone Wall', 17: 'Iron Wall' };
for (const [type, target] of Object.entries(BLUEPRINT_TARGETS)) {
  const index = Number(type);
  const base = 70000 + index;
  PROP_NAMES[base] = `${target} Blueprint Emitter`;
  for (let stage = 1; stage <= 4; stage++) PROP_NAMES[70100 + (index - 1) * 4 + stage] = `${target} ${['Blueprint Fragment', 'Blueprint Draft', 'Blueprint Design', 'Blueprint'][stage - 1]}`;
}

function propName(prop: IPropRow): string {
  const name = PROP_NAMES[prop.id];
  if (!name) throw new Error(`Missing English prop name: ${prop.id}`);
  return name;
}

const STORY_TEXT: Record<number, string[]> = {
  1: ['Ten years after the outbreak, survivors cling to failing forts and Council rations.','Fortress 7, the city\'s worst. Grandmother left you this place and half a Merge Core.','The Steel Council offers thirty cans for this dump.','Two broken crates against the end of the world? Sign, kid.','You say nothing. You drag two rusty blades together.','Steel overlaps. The pattern reforms into a bright new knife.','This fortress takes zombie hordes, not traitors.','...Fine. Very fine.','Confirmed. The core is in their hands.','Drag matching items together to Merge them. Day One begins.'],
  2: ['We held... the first night.','The horde crushed the northern ruins. Tomorrow it will attack from a new direction.','Max-level loot from night battles reaches the board. Sell it for Coins to rebuild.'],
  3: ['This toolbox is getting easier to use. Higher levels uncover more tricks.','Matching emitters can Merge and level up too.'],
  4: ['Can Little Black and I stay? I can fix things, and I barely use any power.','Stay. One more machine means one more hand, and one more power draw. Keep the batteries coming.'],
  5: ['Business is good. Orders, coin chains, and chests all make money.','Build the fortress solid. Winter is long, and I want to keep trading.'],
  6: ['A traveler\'s bag, still locked. Opening it takes time, but what\'s inside is worth it.'],
  7: ['The storage-zone key. The old market\'s best stock is locked behind that row of lockers.'],
  8: ['Automatic sensor key! The storage-zone main door is open.'],
  9: ['The supervisor\'s master access wristband. Every locker opens at once.','Your grandmother never even got one of those.'],
  10: ['Something is moving at the skylight. Mutants are coming in from above; they do not use the door.'],
  11: ['This part came from an emergency radio. Repair it, and we may reach other survivors.'],
  12: ['The ground is shaking. Burrowers will slip past your defenses underground.'],
  13: ['Crackle... This is Northbank Camp. If you hear us, respond.','Received! This is Fortress 7. We\'re still alive.','Good. Hold it. The winter horde will grow worse. Survive and head north.'],
  14: ['The name Fortress 7 now travels through the wasteland.','Northbank is waiting.'],
  16: ['Not bad hands. Two pieces of junk can make something useful. I\'m Old Ghost, black-market runner.','Fill my orders and you\'ll get Stars and Coins. Coins keep a fort standing.','The black-market orders are above the board. Submit a green order once you have the materials.'],
  17: ['Coins in! Ruins ring the fortress, with one small gap to the east. The horde will come through it.','Build an Arrow Tower on the outer ring. Lock down the eastern gap.','Tap Base at the bottom and build an Arrow Tower in the red outer area for 200 Coins.'],
  18: ['Arrow Tower is up, but without power it is decoration.','It needs 2 power. A Power Station Blueprint Emitter is now in Cards. Return to the board, merge its blueprint, then build the station to power the tower.'],
  19: ['The generator is turning. Arrow Tower online!','Before dark, tap Welcome the Night in Base and hold the eastern gap.'],
  20: ['Quick hands. Take these Coins, and get that Power Station up. The fort needs electricity.','Take this crate too. It holds Arrow Tower Blueprint fragments; eight fragments build the Blueprint.'],
  21: ['Nicely done. Take the Coins and these Power Station Blueprint fragments. Towers need power to fire.'],
  22: ['You\'re getting the hang of it. Spend this reward wisely; a fortress always needs Coin.'],
  23: ['Good work. Take the reward. A fort only truly stands once its Blueprints are complete.'],
  24: ['Arrow Tower Blueprint acquired. Select it and tap Use; it will appear in the build list.'],
  25: ['Power Station Blueprint acquired. Select it and tap Use to unlock it. Once the generator turns, towers can fire.'],
  26: ['Power Station Blueprint acquired. Use it to unlock the station. The fortress cannot afford a blackout.'],
  27: ['Power Station unlocked. Tap Base, choose it, and build it on open ground.','Turn board batteries into Fuel so the station can keep running. Power is how we survive each night.'],
  102: ['Morning of Day Two. Someone kicks the gate open.','I\'m Iron Claw. Water and grain around here answer to me.','Seven days. Then I take this broken fort.','...Want a fight? My old gun has not rusted through.','Who are you?','Gatekeeper. Food and drink count as wages.','He joins two broken barrels into an old rifle, sharp and clean.','Old Gun joins the fortress. Hold every night and last these seven days.'],
  103: ['Day Three. Iron Claw cut the water line; the reserve is dry.','Water emergency. Recommendation: Merge a filter.','Two scraps of cloth and an old pipe... Merge.','Muddy water passes through the filter and becomes drinkable.','Those hands are like your grandmother\'s.','You knew my grandmother?','...Drink. Just drink.','Old Gun looks away. He has a story.'],
  104: ['Day Four. A stout woman carrying an iron wok arrives at the gate.','One pot of noodles for a place to sleep. Deal?','I used to be the Council\'s chief nutritionist.','They put rust powder in the rations. I quit.','Aunt Pang joins the fortress; the kitchen has life again.','Machines run best on power. Build more stations and keep the lights on.','Build Power Stations for electricity. Towers and buildings need it to work.'],
  105: ['Day Five. Iron Claw\'s men sneak in at night.','The vegetable patch is trampled; the water pipe is snapped in two.','You little brats! I just planted those greens!','Two damaged pipes detected. Recommendation: Merge.','Two broken pipes become reinforced plumbing. Not a drop leaks.','They\'ll return tonight. Put the Arrow Tower on the east side.','Unlock more building Blueprints. Thicker defenses hold longer.'],
  106: ['Day Six. A final notice is nailed to the gate.','Leave before tomorrow night. The fort stays.','Or we feed you to the horde.','Afraid of one rusty claw?','Afraid. That\'s why we win.','Alert: tomorrow night\'s horde signal is rising abnormally.','Then let him learn not to provoke Fortress 7.'],
  107: ['Day Seven. The decisive battle.','Warning: tonight\'s horde exceeds every record.','Ammo, traps, walls. Merge everything you can.','Two old crossbows Merge into a repeating crossbow on the east wall.','Power full. Hit them hard!','Grandma said a Merge master never fights unprepared.','Merge gear by day. At night, meet the final battle.'],
  108: ['Last night Iron Claw tried to loot the horde.','A Legendary drop Merged into a twin-barrel flame tower.','One shot turned his armored truck into scrap.','...A misunderstanding! All a misunderstanding!','Before you run, fix the water line.','Next day, Iron Claw queues at the gate to buy parts.','Not one screw for sale!'],
  109: ['Day Nine. Clearing the northern ruins reveals an iron box.','Identification complete: Merge Core fragment.','It shares an origin with the half-core inside me.','Why did Grandma bury this in the ruins?','Once this is exposed, trouble will follow.','That night, someone offers ten thousand cans for the fragment.'],
  110: ['Let me introduce myself. Vincent, Council liaison.','No rush on the purchase. We can talk.','Your grandmother was a legend. We were... old friends.','You knew my grandmother?','Future Council commissions will come to you first.','...Voice match 97%. Encrypted area. Access denied.','He smiles warmly. Mancang falls strangely silent.','Volume One ends. Fortress 7 stands, but the game is just beginning.'],
  111: ['Day Eleven. A doctor collapses at the gate.','No water... alcohol first. The scalpel needs disinfecting.','Eat porridge first! You\'re dying and worrying about germs?','...Thank you. Dr. Bai. I can work for my fee.','Two bottles of industrial alcohol Merge into medical alcohol in her hands.','Dr. Bai joins the fortress. The clinic has a keeper.','Night battles leave wounds. A Medical Station helps them heal.'],
  112: ['Day Twelve. People in the fortress are starting to burn with fever.','Radiation fever. Without antibiotics, they will not last three days.','My medicine case burned with the clinic.','Search complete: an abandoned pharmacy is marked.','Move. Bring back anything we can Merge into medicine.'],
  113: ['Two expired medicines Merge into sterile serum.','The fever is down... You saved them.','Dr. Bai, your hands are shaking.','Ten years ago, I treated the first infected.','I kept the original case files. One day they will matter.','She locks the iron case. Its number is worn away.'],
  114: ['Day Fourteen. Someone has stripped the generator for parts.','The culprit is asleep in the pile.','I\'m Xiaodian! Not a thief. I just... like taking things apart.','Look! Put back together, with a better circuit.','Two old wires make a new wire. I know this work.','Efficiency up 12%. This kid is a genius.','Xiaodian joins Fortress 7. Put a power station on the schedule.'],
  115: ['Day Fifteen. The entire fortress goes dark.','All the batteries are old. We need a voltage regulator.','Two dead flashlights can Merge into one. I did the math.','Two dead flashlights Merge into a voltage regulator.','The lights come on. Xiaodian\'s eyes shine brighter.'],
  116: ['Day Sixteen. Xiaodian touches the Merge Core during repairs.','The core lights up; matching circuits rise on her arm.','It hurts... but it feels familiar, like when I was little.','Those patterns... I\'ve seen them in old case files.','Warning: resonance reaction. Archive incomplete. Analysis unavailable.','No one notices the blue flash in Xiaodian\'s shadow.'],
  117: ['Day Seventeen. The Power Station Merge upgrade succeeds.','Brightest fortress in the wasteland. That\'s us!','We can build advanced electric towers now. Leave it to me.','That girl can work. Extra dinner tonight!','Power flows through the fortress, unlocking stronger defenses.'],
  118: ['Day Eighteen. A hungry child crouches outside the warehouse.','I\'m Douzi. I know every road in the city.','I trade intel on supplies and horde times for batteries.','Stay. The exploration team needs a guide.','Douzi joins the fortress. Exploration is unlocked.'],
  119: ['Day Nineteen. Douzi leads a raid on an abandoned supermarket and gets surrounded.','I\'m sorry... I read the timing wrong.','Save your breath. My gun is not old yet.','Two broken freezers Merge into a double-door cold store.','It is packed with combat rations!','Why is there a white coat frozen at the bottom?!','The body clutches a note: Research Institute Seven.'],
  120: ['Day Twenty. Douzi stares at a photo.','My sister had a fever when we were separated.','Earn enough cans and I\'ll buy news of her at the black market.','We\'ll find her. Fortress 7 is your home now.','Douzi nods and slips the note into the wall.'],
  121: ['Day Twenty-One. The exploration team expands; supplies come back full.','Follow me and no truck returns empty.','Log: exploration yield up 50%. Excellent worker: Douzi.','The fortress thrives, but something feels wrong.'],
  122: ['Day Twenty-Two. A crate of medicine is missing from the warehouse.','I checked three times. There is an insider here.','Who?! Even my rice sack is lighter!','Stay calm. I guard the warehouse tonight.','Trust cracks for the first time.'],
  123: ['Day Twenty-Three. Another theft: batteries.','I Merged those all night! Who did this?!','Could it be Dr. Bai? Her medicine source is unclear.','Hmph. Cook, can you account for your rice bags?','Enough. Turning on each other is exactly what they want.','Everyone has secrets. Everyone is suspect.'],
  124: ['Day Twenty-Four. Old Gun sets a trap.','Put a marked can in the warehouse. Whoever touches it shows their face.','Night vision on. Quiet now.','After midnight, a small figure slips into the warehouse.','When the flashlight snaps on, everyone freezes.'],
  125: ['It was me... I\'m sorry.','The Council took my sister. Every theft buys her one more day.','You fool... you should have told us.','Using a child as leverage. Typical Steel Council.','Douzi, lead the way. We\'re bringing your sister home.'],
  126: ['Day Twenty-Six. At the convoy route, Douzi is drenched in sweat.','They cross the broken bridge tomorrow night. Six guards, four guns.','A direct fight will not work. Use a Merge master\'s trick.','Plan: signal jammer. Parts list ready.','No sleep tonight. Merge.'],
  127: ['Day Twenty-Seven, before dawn. One final test.','Three old radios Merge into a signal jammer.','Frequency locked. Their comms die when I say so.','Medkits ready. Bring everyone back.','There\'s hot soup waiting when you return.','Fortress 7 makes its first move.'],
  128: ['Last night at the broken bridge, communications failed and the guards panicked.','Old Gun shot out three headlights; nobody dared move.','Sister! It\'s me. Your brother is here!','A thin girl rushes into Douzi\'s arms from the truck.','Move! Back to the fortress before dawn.','That night, Fortress 7 loses no one.'],
  129: ['Day Twenty-Nine. Douzi\'s sister wakes, repeating numbers.','She keeps saying: 0-7... subject... 7...','That format matches my case files.','Let me see. ...!','Old Gun goes pale and drops his rifle.','That number belongs to the old research institute.'],
  130: ['Day Thirty. Everyone gathers around the table in heavy silence.','I hear you hijacked a convoy. Do not worry.','Some in the Council dislike you. But I am a friend.','Warning: high-frequency scan detected. He is looking for the core.','What do you want, Vincent? And what is Institute Seven?','Volume Two ends. Everyone is pulled toward the same truth.'],
  28: ['Warning: core overload. Defensive line collapsing.','Do not panic. Look carefully: this is your grandmother\'s handwriting.','Merge Core: time rewind, activate.','Light rolls backward. Rubble returns. You are back at this morning.','The zombies remember nothing, but I do.','Repair the defenses. Upgrade the Arrow Tower. This time, do not lose.'],
  131: ['At night, a faint meow comes from outside the fortress.','A stray cat, thin as a rail. Raising a cat costs less food than raising people.','Then it stays. Another mouth is another bit of warmth.','A cat nest arrives on the board. Tap it 12 times and the kitten makes Fortress 7 its home.']
};

export const en: LocaleData = {
  ui: { 'settings.title': 'Settings', 'settings.chinese': 'Chinese', 'settings.english': 'English', 'base.core': 'Base Core', 'action.merge': 'Merge', 'inventory.backpack': 'Backpack', 'resource.fuel': 'Fuel', 'resource.scrap': 'Scrap', 'resource.medicine': 'Medicine', 'dialog.restart': 'Restart', 'dialog.confirmRestart': 'Confirm Restart' },
  props: Object.fromEntries(getAllProps().map(prop => [prop.id, propName(prop)])),
  propDescriptions: Object.fromEntries(getAllProps().map(prop => [prop.id, `A ${propName(prop)} for merging and survival.`])),
  buildings: Object.fromEntries(getAllBuildingConfigs().map(building => [building.id, BUILDINGS[building.id]])),
  heroes: Object.fromEntries(getAllHeroConfigs().map(hero => [hero.key, HEROES[hero.key]])),
  heroDescriptions: Object.fromEntries(getAllHeroConfigs().map(hero => [hero.key, HERO_DESCRIPTIONS[hero.key] ?? 'A defender of Fortress 7.'])),
  speakers: { narrator: '', hero: 'A-He', laogui: 'Old Ghost', xiaoman: 'Xiaoman', beian: 'Northbank', mancang: 'Mancang', laoqiang: 'Old Gun', pangshen: 'Aunt Pang', doctor: 'Dr. Bai', xiaodian: 'Xiaodian', douzi: 'Douzi', wensente: 'Vincent', tiezhua: 'Iron Claw', officer: 'Reclamation Officer' },
  characterBios: CHARACTER_BIOS_EN,
  storyRewards: { 2: 'Night loot sold for 50 Coins' },
  zombies: Object.fromEntries(getAllZombieConfigs().map(zombie => [zombie.id, ZOMBIES[zombie.id]])),
  story: Object.fromEntries(STORY_BEATS.map(beat => {
    const text = STORY_TEXT[beat.id];
    if (!text || text.length !== beat.lines.length) throw new Error(`Missing English story: ${beat.id}`);
    return [beat.id, beat.lines.map((line, index) => ({ who: line.who, text: text[index] }))];
  }))
};

const enCommonUi: Record<string, string> = {
  'panel.backpack': 'Backpack', 'bag.addSlotCost': '+\n{price} Coins', 'story.continue': 'Tap to continue ▼', 'story.close': 'Tap to close ▼',
  'base.building': 'Building', 'side.north': 'North', 'side.west': 'West', 'side.south': 'South', 'side.east': 'East',
  'resource.coin': 'Coins', 'resource.diamond': 'Diamonds', 'resource.power': 'Energy', 'toast.cannotBuild': 'Cannot build here.',
  'hero.outOfBounds': 'Outside the base.', 'hero.innerOnly': 'Heroes can only deploy in the inner zone.', 'hero.cellHasBuilding': 'This cell already has a building.', 'hero.cellHasHero': 'This cell already has a hero.'
};

export const enRuntimeUi: Record<string, string> = { ...enCommonUi,
  'toast.bagBubble': 'Items in bubbles cannot go into the backpack.', 'toast.bagFull': 'Backpack is full.', 'toast.boardFull': 'Board is full.',
  'toast.taskItemsShort': 'Task items are insufficient.', 'toast.resourceShort': 'Not enough {resource}.', 'toast.powerShort': 'Not enough energy.',
  'toast.cannotSell': 'This item cannot be sold.', 'toast.cooling': 'Cooling down. Please wait.', 'toast.noUses': 'No uses left. Wait for cooldown.',
  'toast.spiderCannotMove': 'Webbed items cannot move. Merge with a matching unwebbed item to free it.',
  'toast.spiderBoth': 'Both items are webbed. A matching unwebbed item is needed.', 'toast.maxLevel': 'Already at max level.',
  'toast.spiderTarget': 'The target is webbed and cannot be swapped.', 'toast.spiderSource': 'A webbed item can only merge with a matching unwebbed item.',
  'toast.heroNotJoined': 'This hero has not joined the fortress.', 'toast.heroDeployed': 'This hero is already deployed. Recall them before moving.', 'toast.cannotDeploy': 'Cannot deploy here.',
  'toast.unlimitedEnergy': 'Unlimited energy for {seconds} seconds!', 'toast.acceleratorStarted': 'Accelerator started.', 'toast.oneUnlockOnly': 'Only one item can unlock at a time.',
  'toast.nightStarts': 'Night falls. Energy is fully restored.', 'toast.waveIncoming': 'Wave {wave}/{total} incoming!', 'toast.daybreakLoot': 'Daybreak! Loot: {loot}',
  'toast.timeRewind': 'Time rewind: back to this morning. The core is repaired to 50%.', 'toast.ruinsCollapse': 'The horde collapsed the {side} ruins. They will attack from a new direction next night.',
  'toast.zombieEmerged': '{zombie} emerged from underground!', 'toast.zombieEnraged': '{zombie} is enraged and starts demolishing buildings!', 'toast.zombieExploded': '{zombie} exploded!',
  'toast.towerNoFuel': 'Arrow Tower is unpowered: the station has no fuel. Convert batteries into fuel first.', 'toast.towerNoPower': 'Arrow Tower is unpowered: add generators or reduce power use.', 'toast.buildingDestroyed': '{building} was destroyed!',
  'toast.buildComplete': 'Built: {building}', 'toast.coreUpgradeLocked': 'Core upgrades unlock through the tech line.', 'toast.needBlueprint': 'Upgrading needs one duplicate {building} Blueprint. Merge and use another one first.',
  'toast.notEnoughCoinsUpgrade': 'Not enough Coins: {coins} needed. Sell materials on the black market.', 'toast.buildingUpgraded': '{building} reached Lv.{level}', 'toast.buildingIntact': 'Building is undamaged.',
  'toast.notEnoughCoinsRepair': 'Not enough Coins: repair needs {coins}. Sell materials on the black market.', 'toast.repairComplete': 'Repair complete (-{coins} Coins)', 'toast.cannotDemolishCore': 'The core cannot be demolished.',
  'toast.demolished': 'Demolished: {building}', 'toast.demolishedRefund': 'Demolished: {building} (+{coins} Coins)', 'toast.batteryFuel': 'Battery converted to Fuel +{amount}',
  'toast.buildingNotBuildable': 'This building cannot be placed.', 'toast.buildingLocked': 'Locked: merge {blueprint} to unlock it.', 'toast.outOfBase': 'Outside the base.', 'toast.cellOccupied': 'This cell already has a building.', 'toast.expandTerritory': 'Expand to this cell first.', 'toast.killCorridor': 'Keep an open path for enemies.', 'toast.notEnoughCoinsBuild': 'Not enough Coins: {coins} needed.',
  'zombie.tag.1': '', 'zombie.tag.2': '', 'zombie.tag.3': 'Breaks Wood Walls', 'zombie.tag.4': 'Explodes · Breaks Wood Walls', 'zombie.tag.5': 'Breaks Stone Walls', 'zombie.tag.6': 'Breaks Iron Walls · High DEF', 'zombie.tag.7': 'Flying', 'zombie.tag.8': 'Burrows · Breaks Wood Walls'
};

Object.assign(enRuntimeUi, {
  'item.level': 'Lv.{level}', 'card.title': 'Cards', 'card.count': '{count} cards', 'card.allTitle': 'All Items', 'card.more': 'More', 'card.hint': 'Tap an item to place it on the board',
  'action.popBubble': 'Pop ({cost})', 'action.skipCooldown': 'Skip CD', 'action.view': 'View', 'action.use': 'Use', 'action.convertFuel': 'Fuel', 'action.sell': 'Sell {price}',
  'guide.tag': 'Guide', 'guide.merge': 'Drag matching items together to merge.', 'guide.spawn': 'Tap the glowing item to produce one.', 'guide.collect': 'Keep merging to collect task items.', 'guide.submit': 'Tap a task to submit it for Stars.',
  'guide.emitter': 'Tap the Arrow Tower blueprint box twice for free fragments.', 'guide.blueprintMerge': 'Merge blueprint fragments into an Arrow Tower blueprint.', 'guide.unlockTower': 'Select the full Arrow Tower blueprint, then tap Use to unlock the tower.',
  'guide.buildTower': 'Enough Coins. Open Base and build an Arrow Tower to guard the eastern breach.', 'guide.towerCost': 'The Arrow Tower costs {cost} Coins. Complete a task first.', 'guide.powerEmitter': 'The Arrow Tower has no power. Tap the power-station blueprint box twice for free fragments.', 'guide.powerBlueprintMerge': 'Merge blueprint fragments into a power-station blueprint.', 'guide.unlockGenerator': 'Select the full blueprint, then tap Use to unlock the generator.',
  'guide.buildGenerator': 'Enough Coins. Open Base and build the Wind Power Station to bring the grid online.', 'guide.generatorCost': 'The Wind Power Station costs {cost} Coins. Complete a task first.',
  'character.title': 'Characters', 'character.met': 'Met {count}/{total}', 'character.unknown': 'Not met', 'character.joined': 'Joined the fortress · Can deploy', 'character.back': '‹ Back',
  'page.previous': '‹ Prev', 'page.next': 'Next ›',
  'spawner.defaultName': 'Spawner', 'spawner.title': '{name} Lv.{level} · Products', 'spawner.empty': 'No products available.', 'spawner.chance': '{chance}%', 'spawner.unlockAt': 'Unlocks at Lv.{level}', 'spawner.hint': 'Upgrade for more products · Tap outside to close',
  'task.chainTitle': 'Merge Path', 'task.chainNeed': 'Need: {item} x{count}', 'task.chainSpawner': 'SPAWNER', 'task.chainDirect': 'This task item comes directly from a spawner or reward.', 'task.chainHint': 'Merge two matching items to advance',
  'archive.title': 'Story Archive', 'archive.progress': 'Unlocked {unlocked}/{total}', 'archive.chapter': 'Chapter {chapter}', 'archive.replay': 'Replay'
  ,'hud.roleLv.name': 'Level', 'hud.roleLv.desc': 'Level up through orders and merges.', 'hud.roleLv.source': 'Orders and merges',
  'hud.coin.name': 'Coins', 'hud.coin.desc': 'Buy and upgrade buildings.', 'hud.coin.source': 'Sales, chests, tasks',
  'hud.diamond.name': 'Diamonds', 'hud.diamond.desc': 'Speed up or buy special items.', 'hud.diamond.source': 'Tasks, chests, shop',
  'hud.power.name': 'Energy', 'hud.power.desc': 'Used for spawners and building.', 'hud.power.source': 'Night battles and items',
  'hud.star.name': 'Stars', 'hud.star.desc': 'Earned from tasks to unlock content.', 'hud.star.source': 'Orders',
  'hud.electric.name': 'Power', 'hud.electric.desc': 'Wind stations power the base grid.', 'hud.electric.source': 'Wind Power Station',
  'hud.fuel.name': 'Fuel', 'hud.fuel.desc': 'Convert batteries into Fuel.', 'hud.fuel.source': 'Batteries',
  'hud.medicine.name': 'Medicine', 'hud.medicine.desc': 'Repairs buildings and the core.', 'hud.medicine.source': 'Medical Station',
  'hud.scrap.name': 'Scrap', 'hud.scrap.desc': 'For repairs and low-level merges.', 'hud.scrap.source': 'Recycling and demolition', 'hud.source': 'Source: {source}'
  ,'boot.title': 'Merge Fortress', 'boot.subtitle': 'Merge supplies. Defend the last fortress.', 'boot.loading': 'Loading supplies...', 'boot.ready': 'Ready!',
  'night.title': 'Day {day} · Night', 'night.incoming': 'Zombies incoming...', 'night.coreHp': 'Core HP: {hp}/{maxHp}', 'night.nextWave': 'Next wave... ({wave}/{total})', 'night.waveRemaining': 'Wave {wave}/{total} · {count} left',
  'night.win': 'Daybreak! The base held.', 'night.loss': 'Core overload. Time rewind begins.', 'night.winSub': 'Loot stored. Energy restored.', 'night.lossSub': 'The Merge Core rewinds to morning. Defenses remain.', 'night.returnBase': 'Return to Base', 'night.rewind': 'Back to Morning'
  ,'menu.story': 'Story', 'menu.characters': 'Characters', 'menu.base': 'Base', 'menu.shop': 'Shop', 'menu.settings': 'Settings', 'menu.restart': 'Restart', 'menu.confirm': 'Confirm?'
});

Object.assign(enRuntimeUi, {
  'archive.unlock.newGame': 'Start a new game to unlock', 'archive.unlock.day': 'Survive until Day {day} to unlock', 'archive.unlock.continue': 'Keep playing to unlock',
  'story.reward': '{name} gave an extra {coins} Coins'
});

Object.assign(enRuntimeUi, {
  'game.loadFailed': 'Load failed. Please refresh.\n{error}', 'game.cartonHint': 'Merge two matching adjacent items to open the carton.',
  'game.bubbleHint': 'Items in bubbles cannot merge. It pops in about {seconds}s (into Coins), or spend {diamonds} Diamonds to pop it now.',
  'game.blueprintUnlocked': 'Blueprint used! {building} is unlocked.', 'game.duplicateBlueprint': 'Duplicate Blueprint stored: {building} upgrade material +1 (used for Base upgrades).',
  'game.rewardItem': '{item}{count}', 'game.listSeparator': ', ', 'game.taskRewardIntro': 'Nice work! Here is your extra reward.',
  'game.taskRewardStored': '{names} are now in the card bar.', 'game.bubblePopped': 'The bubble popped.', 'game.levelUp': 'Lv.{level}! Level-up reward earned.',
  'game.acceleratorStopped': 'Accelerator stopped.'
});

Object.assign(enRuntimeUi, {
  'base.tab.tower': 'Towers', 'base.tab.resource': 'Resources', 'base.tab.trap': 'Traps', 'base.tab.wall': 'Walls', 'base.tab.hero': 'Heroes',
  'base.back': 'Back', 'base.day': 'Day {day}', 'base.coreHp': 'Core: {hp}/{maxHp}', 'base.night': 'Face Night', 'base.blackMarket': 'Black Market', 'base.marketStars': 'Stars: {star}', 'base.marketWallet': 'Stars: {star}  Diamonds: {diamond}', 'base.marketExchange': '1 Diamond = 100 Coins', 'base.marketExchanged': 'Exchanged for 100 Coins', 'base.marketPrice': '{star} Stars', 'base.marketBought': '{building} blueprint purchased', 'base.none': 'None', 'base.resourceGain': 'Resource building output: {gain}',
  'base.heroJoined': '{hero} joined the fortress! Deploy them from the Base Heroes tab to defend the inner zone.', 'base.noPower': 'No Power', 'base.buildCancel': 'Tap the building button again to cancel placement.',
  'base.buildHint': 'Tap a building for details, upgrades, or demolition. Resource buildings produce automatically.', 'base.heroGuide': 'Companions who join during the story appear here.',
  'base.heroDeployCancel': 'Tap an empty inner cell to deploy. Tap the hero card again to cancel.', 'base.heroDeployHint': 'Tap a hero card to deploy. Tap a deployed hero to recall or move them.',
  'base.heroStats': 'ATK {attack}  RNG {range}  SPD {speed}', 'base.deployed': 'Deployed', 'base.attackRange': 'Attack / Range', 'base.heroRangeValue': '{attack} / {range} cells',
  'base.attackSpeed': 'Attack Speed', 'base.heroSpeedValue': '{speed} / sec', 'base.description': 'Description', 'base.recall': 'Recall', 'base.move': 'Move', 'base.close': 'Close',
  'base.blueprint': 'Blueprint', 'base.needBlueprint': 'Needs {blueprint}', 'base.towerDesc': 'Attack {attack} Range {range}{slow}', 'base.slow': ' Slow',
  'base.resourceOutput': 'Every {interval}s: {resource}+{amount}', 'base.capIncrease': 'Increase {resources} cap', 'base.lowResourceOutput': 'Low-tier materials every {interval}s',
  'base.resourceBuilding': 'Resource Building', 'base.attack': 'Attack {attack}', 'base.slowPercent': 'Slow {percent}%', 'base.durability': 'Durability {hp}', 'base.placeHint': 'Tap a cell to place',
  'base.buildingLocked': '{building} is locked: merge {blueprint} fragments to get {blueprint}.', 'base.notEnoughCoins': 'Not enough Coins: need {coins}. Sell materials on the black market.',
  'base.health': 'HP', 'base.buildingRangeValue': '{attack} / {range} cells', 'base.output': 'Output', 'base.resourceOutputSpaced': 'Every {interval}s: {resource}+{amount}',
  'base.lowResourceOutputSpaced': 'Every {interval}s: low-tier materials ×1', 'base.capBonus': 'Cap Bonus', 'base.powerNeeded': 'Power Needed', 'base.powerUse': '{need} (using {used}/{cap})',
  'base.fuel': 'Fuel', 'base.fuelEmpty': 'Fuel depleted: convert batteries into Fuel.', 'base.fuelRemaining': 'Fuel {fuel} (1 per generator/hour, about {hours} hours left)',
  'base.noPowerAtNight': 'No Power (cannot fire at night. Build more Wind Power Stations.)', 'base.noPowerHint': 'No Power (build more Wind Power Stations or reduce power use.)', 'base.status': 'Status',
  'base.upgradeCost': 'Upgrade Cost', 'base.maxLevel': 'Max Level', 'base.upgradeCostValue': '{cost} + Blueprint ×1 (stock {stock})', 'base.demolishRefund': 'Demolition Refund',
  'base.repair': 'Repair ({coins} Coins)', 'base.upgrade': 'Upgrade', 'base.demolish': 'Demolish', 'base.hordePreview': 'Day {day} · Horde Preview',
  'base.coreDamaged': '⚠ Core HP {hp}/{maxHp}. Repair it first.', 'base.coreHealth': 'Core HP {hp}/{maxHp}', 'base.attackSide': '{side} ({count} cells)',
  'base.listSeparator': ', ', 'base.allSidesBlocked': 'All sides are blocked. Zombies will demolish in place.', 'base.attackDirection': 'Attack Direction',
  'base.waveScale': '{waves} waves · about {total} zombies · Zombie Lv.{level}', 'base.bossLast': ' · Boss in the last wave!', 'base.eliteLast': ' · Elite guaranteed in the last wave',
  'base.waveScaleLabel': 'Wave Scale', 'base.enemyType': 'Enemy Types', 'base.guaranteedLast': ' (last-wave guaranteed)', 'base.fight': 'Fight', 'base.prepareMore': 'Prepare More'
});
