import React from 'react';
import { motion } from 'framer-motion';
import {
  Home, Building, Layout, User, Search, Heart, MapPin,
  TrendingUp, Star, ArrowRight, Menu, Bell, LogIn, CheckCircle, LogOut,
  Phone, Mail, MessageCircle, FileText, ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// 24 Prestigious local Ethiopian Estates, all unified under the architectural CAD/3D rendering concept.
// Every property has a dedicated perpendicular Front facade rendering, a flat Side elevation rendering, and a clean elevated Top/axonometric model projection.
const luxuryProperties = [
  // ================= VILLAS (8) =================
  {
    id: 'v1',
    type: 'Villas',
    image: '/sheger_front.jpg',
    title: 'Sheger Luxury Villa',
    price: '240,000,000 ETB',
    location: 'Bole Residential Zone, Addis Ababa',
    tags: ['Elite', 'Infinity Pool', 'Smart Home'],
    features: {
      beds: 6,
      baths: 8,
      sqm: 1200,
      amenities: ['Heated Infinity Pool', 'Cozy Family Cinema', 'Built-in Safe Room', 'AI Smart Home Control', '8-Car Basement Parking', 'Secured Perimeter Fence']
    },
    views: {
      front: '/sheger_front.jpg',
      side: '/sheger_side.jpg',
      top: '/sheger_top.jpg'
    },
    description: 'This breathtaking family villa features beautiful stone work, a warm infinity pool for hot days, and simple smart home controls. Located in a secure, quiet corner of Bole, it is perfect for families who appreciate fine modern living in the capital.',
    status: '🔴 Just Listed',
    story: "Host diplomats in your private cinema. This is not a home — it is a statement of power.",
  },
  {
    id: 'v2',
    type: 'Villas',
    image: '/adey_villa_front.jpg',
    title: 'Adey Abeba Garden Villa',
    price: '180,000,000 ETB',
    location: 'Sarbet, Addis Ababa',
    tags: ['Modern', 'Heated Floors', 'Wine Cellar'],
    features: {
      beds: 5,
      baths: 6,
      sqm: 950,
      amenities: ['Custom Exposed Concrete Design', 'Underfloor Heating', 'Climatized Wine Cellar', 'Private Fitness Room', 'Sunny Rooftop Terrace', 'Hybrid Solar Grid System']
    },
    views: {
      front: '/adey_villa_front.jpg',
      side: '/adey_villa_side.jpg',
      top: '/adey_villa_top.jpg'
    },
    description: 'A cozy and welcoming contemporary home designed for families who love hosting guests. Features underfloor heating for cool Addis mornings, a beautifully built private cellar, and a spacious green lawn where children can play safely.',
    story: "Wake up to Addis mornings with heated floors and espresso from your sun-drenched terrace.",
  },
  {
    id: 'v3',
    type: 'Villas',
    image: '/taitu_front.jpg',
    title: 'Taitu Palace Estate',
    price: '345,000,000 ETB',
    location: 'Old Airport Road, Addis Ababa',
    tags: ['Grand', 'Helipad', 'Exclusive'],
    features: {
      beds: 7,
      baths: 9,
      sqm: 1600,
      amenities: ['Private Rooftop Helipad', '12-Car Showroom Garage', 'Indoor Olympic Pool', 'Detached Staff Quarters', 'Borehole Water System', 'Biometric Gate Access']
    },
    views: {
      front: '/taitu_front.jpg',
      side: '/taitu_side.jpg',
      top: '/taitu_top.jpg'
    },
    description: 'A stunning traditional manor situated in the elegant neighborhood of Old Airport. This spacious estate includes a private pool house, professional water borehole filters, and beautifully landscaped gardens filled with local highland flowers.',
    status: '⏳ Under Offer',
    story: "Your own helipad. Your own pool house. Your own dynasty begins at Taitu Palace.",
  },
  {
    id: 'v4',
    type: 'Villas',
    image: '/hora_crater_front.jpg',
    title: 'Hora Crater Lake Villa',
    price: '135,000,000 ETB',
    location: 'Babogaya Lake Ridge, Bishoftu',
    tags: ['Crater View', 'Eco-Tech', 'Pool'],
    features: {
      beds: 5,
      baths: 6,
      sqm: 850,
      amenities: ['360° Crater Lake Views', 'Organic Greenhouse', 'Tesla Battery Backup', 'Outdoor Stone Firepit', 'Private Spa & Sauna', 'Water Recycling Setup']
    },
    views: {
      front: '/hora_crater_front.jpg',
      side: '/hora_crater_side.jpg',
      top: '/hora_crater_top.jpg'
    },
    description: 'Wake up to the spectacular views of Babogaya Crater Lake in Bishoftu. This environment-friendly stone villa matches the local cliffs, offering a peaceful infinity pool, huge wrap-around wooden decks, and quiet garden paths for resting.',
    story: "Sip Ethiopian coffee watching flamingos land on a volcanic crater lake — from your living room.",
  },
  {
    id: 'v5',
    type: 'Villas',
    image: '/selam_glass_front.jpg',
    title: 'Selam Glass Villa',
    price: '190,000,000 ETB',
    location: 'CMC Green Zone, Addis Ababa',
    tags: ['Glass-walls', 'Pool', 'Elevator'],
    features: {
      beds: 4,
      baths: 5,
      sqm: 1100,
      amenities: ['Double-glazed Glass Walls', 'Internal Glass Elevator', 'Sunken Courtyard Pool', 'Outdoor Lounge Pavilions', 'Smart VRV Air Conditioning', 'High-end Chef Kitchen']
    },
    views: {
      front: '/selam_glass_front.jpg',
      side: '/selam_glass_side.jpg',
      top: '/selam_glass_top.jpg'
    },
    description: 'A modern glasshouse sanctuary that blends beautiful indoor spaces with lush green gardens in CMC. It features a private lift, open-plan dining area, and a central blue pool perfect for refreshing afternoon swims.',
    story: "Where ancient Lalibela stone meets modern genius. A villa that tells a thousand-year story.",
  },
  {
    id: 'v7',
    type: 'Villas',
    image: '/goha_hawassa_front.jpg',
    title: 'Goha Hawassa Lake Villa',
    price: '155,000,000 ETB',
    location: 'Lakeside Drive, Hawassa',
    tags: ['Lakefront', 'Quiet', 'Infinity Spa'],
    features: {
      beds: 5,
      baths: 5,
      sqm: 900,
      amenities: ['Lakeside Lawn access', 'Private Boat Dock', 'Tesla Battery Wall', 'Outdoor Jacuzzi Spa', 'Soundproof Cinema Room', 'Water Filtration System']
    },
    views: {
      front: '/goha_hawassa_front.jpg',
      side: '/goha_hawassa_side.png',
      top: '/goha_hawassa_top.jpg'
    },
    description: 'Escape the capital to the beautiful shores of Hawassa. This lakeside home features a private boat jetty, a large green lawn running directly to the water, and a peaceful spa pavilion for the ultimate relaxing weekend.',
    story: "Fall asleep to the sound of Lake Hawassa waves, wake up to a paradise only you can see.",
  },
  {
    id: 'v8',
    type: 'Villas',
    image: '/abay_tana_front.jpg',
    title: 'Abay Tana Grand Estate',
    price: '290,000,000 ETB',
    location: 'Tana Shoreline, Bahir Dar',
    tags: ['Tana View', 'Grand Garden', 'Butler Service'],
    features: {
      beds: 8,
      baths: 10,
      sqm: 2100,
      amenities: ['Grand Dining Hall', 'Direct Lake Tana Access', 'Professional Main Kitchen', 'Bespoke Lighting Systems', '24/7 Security Force', 'Rooftop Helipad Access']
    },
    views: {
      front: '/abay_tana_front.jpg',
      side: '/abay_tana_side.png',
      top: '/abay_tana_top.jpg'
    },
    description: 'An outstanding palace situated in Bahir Dar on the historic shores of Lake Tana. Includes beautiful expansive mature gardens, a private boat house, a professional service wing, and highly secure private parking.',
    story: "Sail on Lake Tana at sunrise, return to your private jetty by sunset. This is living.",
  },
  {
    id: 'v9',
    type: 'Villas',
    image: '/entoto_mountain_front.jpg',
    title: 'Entoto Mountain Villa',
    price: '115,000,000 ETB',
    location: 'Entoto Forest Ridge, Addis Ababa',
    tags: ['Mountain Retreat', 'Forest View', 'Eco-Luxe'],
    features: {
      beds: 5,
      baths: 6,
      sqm: 950,
      amenities: ['Expansive Pine Forest Backyard', 'Panoramic Skyline Views of Addis', 'Detached Traditional Guest Tukul', 'Eco-friendly Rainwater Collection', 'Highland Flower Garden & Footpaths', 'Cozy Stone Fireplace & Cigar Lounge']
    },
    views: {
      front: '/entoto_mountain_front.jpg',
      side: '/entoto_mountain_side.jpg',
      top: '/entoto_mountain_top.jpg'
    },
    description: 'Perched high on the Entoto Mountain Ridge overlooking Addis Ababa. This eco-luxury stone retreat features beautiful traditional thatched roofing, separate round guest cottages (Tukul), cozy stone fireplaces, and lush walking paths winding through the native eucalyptus and pine forest.',
    story: "Wake up to breathtaking views in your v9. This is not just a home—it\'s a statement.",
  },

  // ================= PENTHOUSES (8) =================
  {
    id: 'p1',
    type: 'Penthouses',
    image: '/lalibela_front.jpg',
    title: 'Lalibela Heights Penthouse',
    price: '140,000,000 ETB',
    location: 'Bole, Addis Ababa',
    tags: ['New', 'Sky-Pool', 'Skyline View'],
    features: {
      beds: 4,
      baths: 5,
      sqm: 650,
      amenities: ['Private Sky-Pool', '24/7 Concierge Service', 'Private Express Lift', 'Panoramic City Views', 'Wrap-around Balcony', 'Outdoor Sky BBQ Lounge']
    },
    views: {
      front: '/lalibela_front.jpg',
      side: '/lalibela_side.jpg',
      top: '/lalibela_top.jpg'
    },
    description: 'Live high above the capital in Bole’s premier luxury tower. This duplex penthouse features its own heated sky-pool on the balcony, a private express lift, and absolute peace and quiet high above the city.',
    status: '🔴 Just Listed',
    story: "The entire city at your feet. Bole Platinum is not an address — it is a destination.",
  },
  {
    id: 'p2',
    type: 'Penthouses',
    image: '/unity_front.jpg',
    title: 'Unity Park Sky Penthouse',
    price: '170,000,000 ETB',
    location: 'Kazanchis Business Zone, Addis Ababa',
    tags: ['Duplex', 'Central', 'Jacuzzi'],
    features: {
      beds: 5,
      baths: 6,
      sqm: 800,
      amenities: ['Double Height Atrium', 'Rooftop Lounge Terrace', 'Private Heated Jacuzzi', 'Integrated Smart Home', 'Acoustic Soundproofing', 'Private Wine Cellar']
    },
    views: {
      front: '/unity_front.jpg',
      side: '/unity_side.jpg',
      top: '/unity_top.jpg'
    },
    description: 'A masterfully crafted double-story loft in Kazanchis. Features large sky-facing windows, warm wood floors, and a gorgeous private rooftop patio with a hot jacuzzi overlooking the central towers.',
    story: "Own the sky above Kazanchis. Every sunset is your private masterpiece.",
  },
  {
    id: 'p3',
    type: 'Penthouses',
    image: '/hora_front.jpg',
    title: 'Hora Lake-View Skyvilla',
    price: '160,000,000 ETB',
    location: 'Kirkos, Addis Ababa',
    tags: ['Infinity Pool', 'Cigar Lounge', 'Private Lift'],
    features: {
      beds: 4,
      baths: 4,
      sqm: 720,
      amenities: ['Glass Infinity Pool', 'Cosy Lounge & Bar', 'Express Private Elevators', 'Skyline Viewing Deck', 'Medical Air Filtration', 'His/Hers Walk-in Closets']
    },
    views: {
      front: '/hora_front.jpg',
      side: '/hora_side.jpg',
      top: '/hora_top.jpg'
    },
    description: 'A highly luxurious sky home located in Kirkos. Features an exquisite glass-sided infinity pool on the upper deck, a warm private wood-paneled lounge, and high-speed elevators straight into your living room.',
    story: "From your rooftop, watch the sun paint the Rift Valley gold. Live above it all.",
  },
  {
    id: 'p4',
    type: 'Penthouses',
    image: '/adwa_front.jpg',
    title: 'Adwa Victory Loft',
    price: '115,000,000 ETB',
    location: 'Historic Piassa, Addis Ababa',
    tags: ['Heritage', 'Loft', 'Rooftop Gym'],
    features: {
      beds: 3,
      baths: 4,
      sqm: 540,
      amenities: ['Historical Red Brickwork', 'Bespoke Local Furniture', 'Gallery Spotlighting', 'Private Rooftop Gym', 'High-Fidelity Audio System', 'Dual Level Glass Stairs']
    },
    views: {
      front: '/adwa_front.jpg',
      side: '/adwa_side.jpg',
      top: '/adwa_top.jpg'
    },
    description: 'Located in the historic Piassa district. This loft combines beautiful vintage exposed brick walls with modern luxury finishes, a private rooftop fitness studio, and incredible views of Piassa’s warm old streets.',
    story: "History lives in these walls. Piassa heritage meets tomorrow in this extraordinary loft.",
  },
  {
    id: 'p5',
    type: 'Penthouses',
    image: '/semien_front.jpg',
    title: 'Semien Skyline Penthouse',
    price: '195,000,000 ETB',
    location: 'Meskel Square, Addis Ababa',
    tags: ['360 Skyline', 'Helipad', 'Smart Glass'],
    features: {
      beds: 5,
      baths: 5,
      sqm: 920,
      amenities: ['360° Skyline Panoramic View', 'Direct Helipad Access', 'Tinting Smart Glass', 'Secured Master Suite', 'Service Concierge Kitchen', 'Private Spa Suite']
    },
    views: {
      front: '/semien_front.jpg',
      side: '/semien_side.jpg',
      top: '/semien_top.jpg'
    },
    description: 'A spectacular glass sanctuary right at Meskel Square. Enjoy complete privacy with soundproof glass walls, electrochromic smart window tinting, a secure master wing, and instant tower helipad access.',
    status: '⏳ Under Offer',
    story: "Helicopters land on your roof. Smart glass dims at your command. Welcome to the future.",
  },
  {
    id: 'p6',
    type: 'Penthouses',
    image: '/axum_front.jpg',
    title: 'Axum Obelisk Penthouse',
    price: '230,000,000 ETB',
    location: 'Bole Atlas, Addis Ababa',
    tags: ['Triplex', 'Golf-Putting', 'Sky-elevator'],
    features: {
      beds: 6,
      baths: 8,
      sqm: 1150,
      amenities: ['Three-Level Layout', 'Rooftop Golf Putting Green', 'Addis Finest Private Spa', 'Private Internal Glass Elevator', 'High-security Safe Room', 'Climate-Controlled Lounge']
    },
    views: {
      front: '/axum_front.jpg',
      side: '/axum_side.jpg',
      top: '/axum_top.jpg'
    },
    description: 'An absolute masterpiece spread across three floors in Bole Atlas. Features its own glass lift inside the penthouse, a private rooftop putting green, and a gorgeous private sauna.',
    story: "Three floors of pure indulgence. A putting green in the sky. Addis has never seen this.",
  },
  {
    id: 'p7',
    type: 'Penthouses',
    image: '/nechsar_front.jpg',
    title: 'Nech Sar Vista Penthouse',
    price: '98,000,000 ETB',
    location: 'Forty Springs Ridge, Arba Minch',
    tags: ['Nech Sar Vista', 'Lake Abaya View', 'Eco-Luxe'],
    features: {
      beds: 4,
      baths: 4,
      sqm: 680,
      amenities: ['Private Viewing Terrace', 'Eco Solar Power System', 'Thermal Hot Spring Tub', 'Dolby Cinema Lounge', 'Traditional Woodwork', 'CCTV Security Network']
    },
    views: {
      front: '/nechsar_front.jpg',
      side: '/nechsar_side.jpg',
      top: '/nechsar_top.jpg'
    },
    description: 'Perched on the famous Arba Minch cliffs. Offers a stunning view of Nech Sar National Park and the beautiful lakes Abaya and Chamo. Designed with warm local timber and complete with modern solar tech.',
    story: "Nech Sar at dawn. Lake Abaya at dusk. Nature designed this view just for you.",
  },
  {
    id: 'p8',
    type: 'Penthouses',
    image: '/tana_front.jpg',
    title: 'Tana Retractable Penthouse',
    price: '190,000,000 ETB',
    location: 'Lideta, Addis Ababa',
    tags: ['Skydome', 'Retractable Glass', 'Lounge'],
    features: {
      beds: 5,
      baths: 6,
      sqm: 850,
      amenities: ['Retractable Glass Roof', 'Private Cinema Loft', 'Modern Entertainment Lounge', 'Fingerprint Safe Room', 'Private Steam Bath', '24/7 Security Patrol']
    },
    views: {
      front: '/tana_front.jpg',
      side: '/tana_side.jpg',
      top: '/tana_top.jpg'
    },
    description: 'Sleep directly under the stars with Lideta’s most unique sky-dome retractable glass roof. Features a spacious private home theater, a fully equipped bar and lounge, and fingerprint-access safety lockers.',
    story: "Sleep under the stars through a retractable glass sky-dome. Lideta will never be the same.",
  },

  // ================= COMMERCIAL (8) =================
  {
    id: 'c1',
    type: 'Commercial',
    image: '/abay_front.jpg',
    title: 'Abay Commercial Tower',
    price: '680,000,000 ETB',
    location: 'Kazanchis Commercial Zone, Addis Ababa',
    tags: ['Kazanchis', '15 Floors', 'Fiber Net'],
    features: {
      floors: 15,
      units: 45,
      sqm: 8500,
      amenities: ['Triple-source Power Grid', '120-Car Underground Basement', 'High-Speed Fiber Terminal', 'Triple Height Marble Atrium', 'Tier-III Security Center', 'Executive Conference Hall']
    },
    views: {
      front: '/abay_front.jpg',
      side: '/abay_side.jpg',
      top: '/abay_top.jpg'
    },
    description: 'An ultra-modern commercial building in Kazanchis, ideal for corporate headquarters or banking institutions. Includes triple-source power generators, massive parking, and high-speed fiber lines.',
    status: '🔴 Just Listed',
    story: "Command Bole from your corner office. Where Ethiopian commerce meets global ambition.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c2',
    type: 'Commercial',
    image: '/sheger_front.png',
    title: 'Sheger Business Center',
    price: 'Price on Request', hidePrice: true,
    location: 'Bole Medhanialem, Addis Ababa',
    tags: ['HQ', 'Bole', 'Helipad'],
    features: {
      floors: 20,
      units: 80,
      sqm: 12000,
      amenities: ['Corporate Rooftop Helipad', 'Integrated Tier III Server HQ', 'Energy-Efficient Double Glazing', 'Brutalist Concrete Lobby', 'Smart Card Access Control', 'EV Charging Hub']
    },
    views: {
      front: '/sheger_front.png',
      side: '/sheger_side.png',
      top: '/sheger_top.png'
    },
    description: 'A spectacular 20-story skyscraper in the heart of Bole. Specially optimized for high-tech firms, featuring a professional server room, rooftop helipad, and biometric access controls.',
    status: '🟡 Price on Request',
    story: "Price on request for a reason. This is where billion-birr deals are closed.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c3',
    type: 'Commercial',
    image: '/adey_front.jpg',
    title: 'Adey Commercial Mall',
    price: 'Price on Request', hidePrice: true,
    location: 'Bole Atlas, Addis Ababa',
    tags: ['Retail Mall', 'Escalators', 'Atrium'],
    features: {
      floors: 6,
      units: 110,
      sqm: 16500,
      amenities: ['Luxury Glass Sky Atrium', 'Central Multi-Zone VRV AC', 'Heavy-Duty Escalator System', 'Premium Retail Fronts', 'Loading Bay Access', '150-Car Parking Lot']
    },
    views: {
      front: '/adey_front.jpg',
      side: '/adey_side.jpg',
      top: '/adey_top.jpg'
    },
    description: 'Addis Ababa’s premier commercial shopping mall in Bole Atlas. Featuring high-end double height retail fronts, heavy-duty escalators, central multi-zone cooling, and parking for 150 vehicles.',
    status: '🟡 Price on Request',
    story: "The anchor tenants are already here. Your corporate headquarters is waiting.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c4',
    type: 'Commercial',
    image: '/fasil_front.jpg',
    title: 'Fasil Commercial Plaza',
    price: '480,000,000 ETB',
    location: 'Sarbet, Addis Ababa',
    tags: ['Sarbet', 'Solar Hybrid', 'Lounge'],
    features: {
      floors: 10,
      units: 30,
      sqm: 6200,
      amenities: ['Panoramic Rooftop Restaurant', 'Hybrid Solar Grid System', 'Biometric Entry Turnstiles', 'VIP Executive Club Lounge', 'Centralized Sprinkler Network', 'High-Speed OTIS Elevators']
    },
    views: {
      front: '/fasil_front.jpg',
      side: '/fasil_side.jpg',
      top: '/fasil_top.jpg'
    },
    description: 'A contemporary business tower in Sarbet. Equipped with a huge rooftop cafeteria overlooking the capital, a hybrid solar generator system, and a warm lobby lounge perfect for client meetings.',
    story: "Dire Dawa is rising. Secure your commercial footprint in Ethiopia\'s next boom city.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c5',
    type: 'Commercial',
    image: '/gadaa_front.jpg',
    title: 'Gadaa Business Tower',
    price: '390,000,000 ETB',
    location: 'Gadaa Boulevard, Adama',
    tags: ['Adama Hub', 'Showroom', 'Modern Office'],
    features: {
      floors: 8,
      units: 35,
      sqm: 5800,
      amenities: ['Premium Ground Showroom', 'Heavy Duty Solar Hybrid', 'High-capacity lifts', 'Fibre Internet Mainline', 'VIP meeting suites', 'Secure Cash Vaults']
    },
    views: {
      front: '/gadaa_front.jpg',
      side: '/gadaa_side.jpg',
      top: '/gadaa_top.jpg'
    },
    description: 'A beautiful regional headquarters located in the high-growth trade city of Adama. Includes double height ground showrooms, secure cash vaults, and high-speed lifts, ideal for corporate banking.',
    status: '⏳ Under Offer',
    story: "Eight premium retail floors on CMC Road. The address every brand is fighting for.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c6',
    type: 'Commercial',
    image: '/awash_front.jpg',
    title: 'Awash Trade Plaza',
    price: '610,000,000 ETB',
    location: 'CMC Main Road, Addis Ababa',
    tags: ['CMC', 'Retail', 'Metro Link'],
    features: {
      floors: 8,
      units: 40,
      sqm: 7500,
      amenities: ['Direct Metro Station Tunnel', 'Interactive LED Outdoor Wall', 'High-capacity Loading Docks', 'Central Air VRV', 'CCTV Control Suite', 'Underground Parking']
    },
    views: {
      front: '/awash_front.jpg',
      side: '/awash_side.jpg',
      top: '/awash_top.jpg'
    },
    description: 'A premier retail plaza connected directly to the CMC Light Rail Metro. Features an amazing interactive outer LED screen, easy loading bays, and 24/7 security control suites.',
    story: "The tallest mixed-use tower in the Horn of Africa. Own a floor. Own the future.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c7',
    type: 'Commercial',
    image: '/kezira_front.jpg',
    title: 'Kezira Trade Plaza',
    price: '420,000,000 ETB',
    location: 'Kezira District, Dire Dawa',
    tags: ['Dire Dawa', 'Trade Zone', 'VIP Lift'],
    features: {
      floors: 9,
      units: 32,
      sqm: 6100,
      amenities: ['Dual Water Reservoirs', 'High-Capacity Generators', 'Custom VIP lifts', 'Fibre-linked Server room', 'Outdoor Café Patio', 'CCTV Security']
    },
    views: {
      front: '/kezira_front.jpg',
      side: '/kezira_side.jpg',
      top: '/kezira_top.jpg'
    },
    description: 'A highly functional commercial tower located in Dire Dawa’s active Kezira trade district. Includes dual backup water wells, powerful generators, and robust fiber connections.',
    story: "Trade flows through Adama. Position your enterprise at the gateway to East Africa.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  },
  {
    id: 'c8',
    type: 'Commercial',
    image: '/unity_corp_front.jpg',
    title: 'Unity Corporate Skyscraper',
    price: 'Price on Request', hidePrice: true,
    location: 'Mexico Square, Addis Ababa',
    tags: ['Mexico', 'Skyscraper', 'Vertical Garden'],
    features: {
      floors: 18,
      units: 60,
      sqm: 11000,
      amenities: ['Stunning Glass Vertical Gardens', '150-Seat Executive Amphitheater', 'Dedicated Water Reservoir', '24/7 Security Patrol Unit', 'Triple Generators Power Backup', 'Smart Climate Facade']
    },
    views: {
      front: '/unity_corp_front.jpg',
      side: '/unity_corp_side.jpg',
      top: '/unity_corp_top.jpg'
    },
    description: 'A landmark 18-story corporate skyscraper. Features spectacular vertical sky gardens, a 150-seat executive conference theater, a dedicated backup water reservoir, and 24/7 private security detail.',
    status: '🟡 Price on Request',
    story: "Sky gardens and corporate power. Unity Tower is where empires are built.",
    commercialDetails: {
      leasePriceSqm: '2,500 ETB / m²',
      efficiency: '85%',
      parkingRatio: '1 bay per 50 m²',
      powerBackup: 'Triple-redundant Tier III generators',
      anchorTenants: ['Global Tech Inc.', 'Ethio Investment Bank']
    },
  }
];

const luxuryCollections = [
  {
    id: 'c1',
    name: 'Lakeside Pavilions',
    count: 2,
    image: '/goha_hawassa_front.jpg',
    tagline: 'Refined waterfront living along Hawassa and Tana shores',
    propertyIds: ['v7', 'v8'],
    color: '#0284c7'
  },
  {
    id: 'c2',
    name: 'Capital Skylines',
    count: 3,
    image: '/unity_corp_front.jpg',
    tagline: 'Modern retail hubs, commercial offices, and soaring penthouses',
    propertyIds: ['c8', 'c6', 'p1'],
    color: '#6366f1'
  },
  {
    id: 'c3',
    name: 'Highland Escapes',
    count: 2,
    image: '/entoto_mountain_front.jpg',
    tagline: 'Eco-luxe retreats amidst native pine forests and craters',
    propertyIds: ['v9', 'v4'],
    color: '#059669'
  },
  {
    id: 'c4',
    name: 'Historical Legacy',
    count: 2,
    image: '/taitu_front.jpg',
    tagline: 'Grand imperial designs inspired by Ethiopian heritage',
    propertyIds: ['v3', 'c4'],
    color: '#b45309'
  }
];

const PublicDashboard = ({ user: propUser, setUser: propSetUser }) => {
  const navigate = useNavigate();
  const [showLogoModal, setShowLogoModal] = React.useState(false);
  const [activeNav, setActiveNav] = React.useState('Properties');
  const clickCountRef = React.useRef(0);
  const resetTimeoutRef = React.useRef(null);

  const [localUser, setLocalUser] = React.useState(null);
  const user = propUser || localUser;
  const setUser = propSetUser || setLocalUser;

  React.useEffect(() => {
    if (!propUser) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setLocalUser(JSON.parse(savedUser));
      }
    }
  }, [propUser]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  const getAvatarColor = (name) => {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#14b8a6', '#6366f1', '#f43f5e'
    ];
    if (!name) return '#8dc63f';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const handleAvatarClick = () => {
    if (user) {
      navigate(`/profile/${user.id}`, { state: { edit: true } });
    } else {
      navigate('/login');
    }
  };

  // Dynamic Property State Management
  const [selectedFilter, setSelectedFilter] = React.useState('All');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [priceRange, setPriceRange] = React.useState('All');
  const [bedsFilter, setBedsFilter] = React.useState('All');
  const [locationFilter, setLocationFilter] = React.useState('All');
  const [showInquiryModal, setShowInquiryModal] = React.useState(false);
  const [showBrochureModal, setShowBrochureModal] = React.useState(false);
  const [selectedProperty, setSelectedProperty] = React.useState(null);

  // Elevational views inside the Modal
  const [activeModalView, setActiveModalView] = React.useState('front');

  // Perfect Confirmation Modal state
  const [showSuccessModal, setShowSuccessModal] = React.useState(false);

  // Collections Screen States
  const [selectedCollection, setSelectedCollection] = React.useState(null);

  // Insights Screen States
  const [investmentAmount, setInvestmentAmount] = React.useState(50000000); // 50,000,000 ETB
  const [holdingPeriod, setHoldingPeriod] = React.useState(5); // 5 years
  const [appreciationRate, setAppreciationRate] = React.useState(15); // 15% annual growth

  // Ref for smooth-scrolling to the property grid
  const portfolioRef = React.useRef(null);

  // Sync / Reset Elevational View whenever selected property changes
  React.useEffect(() => {
    setActiveModalView('front');
  }, [selectedProperty]);

  // Clean up timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleSupportClick = () => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    clickCountRef.current += 1;

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      navigate('/login');
    } else {
      resetTimeoutRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 1500);
    }
  };

  const handleBookTour = () => {
    // Perfect custom confirmation transition:
    // 1. Close detail modal
    setSelectedProperty(null);
    // 2. Show beautiful custom success screen
    setShowSuccessModal(true);
  };

  const NavItem = ({ icon: Icon, label }) => (
    <div
      onClick={() => setActiveNav(label)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.8rem 1.25rem',
        cursor: 'pointer',
        borderRadius: '12px',
        background: activeNav === label ? '#f1f5f9' : 'transparent',
        color: activeNav === label ? '#0f172a' : '#64748b',
        fontWeight: activeNav === label ? 700 : 500,
        transition: 'all 0.2s',
        marginBottom: '0.5rem'
      }}
    >
      <Icon size={18} />
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </div>
  );

  // Re-designed Rich Property Card Component with Stacked Title & Price
  const formatUSD = (priceStr) => {
    if (!priceStr || priceStr.includes('Request')) return null;
    const etbNum = parseInt(priceStr.replace(/,/g, '').replace(' ETB', ''), 10);
    if (isNaN(etbNum)) return null;
    return `~$${Math.round(etbNum / 120).toLocaleString()} USD`;
  };

  const PropertyCard = ({ property, onClick }) => {
    const { image, title, price, location, tags, type, features, story, status, hidePrice } = property;
    return (
      <motion.div
        whileHover={{ y: -8, scale: 1.01 }}
        onClick={onClick}
        style={{
          background: 'white',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
          cursor: 'pointer',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative'
        }}
      >
        {status && (
          <div style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            zIndex: 10,
            background: 'white',
            padding: '0.4rem 0.8rem',
            borderRadius: '50px',
            fontSize: '0.75rem',
            fontWeight: 800,
            color: '#0f172a',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}>
            {status}
          </div>
        )}
        <div>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <img src={image} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          <div style={{ padding: '1.75rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.4rem 0', color: '#0f172a', lineHeight: '1.3' }}>{title}</h3>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: hidePrice ? '#10b981' : '#0f172a' }}>{price}</div>
              {!hidePrice && formatUSD(price) && (
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>{formatUSD(price)} (approx.)</div>
              )}
            </div>

            {story && (
              <p style={{ fontSize: '0.9rem', color: '#475569', fontStyle: 'italic', marginBottom: '1rem', lineHeight: '1.4' }}>"{story}"</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              <MapPin size={16} color="#0f172a" />
              <span style={{ fontWeight: 500 }}>{location}</span>
            </div>

            {/* Core Features */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              padding: '0.75rem 0',
              borderTop: '1px solid #f1f5f9',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: '1.25rem',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: 600
            }}>
              {type === 'Commercial' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Building size={16} color="#64748b" />
                    <span>{features.floors} Floors</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layout size={16} color="#64748b" />
                    <span>{features.units} Units</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🛏️ {features.beds} Beds</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🛁 {features.baths} Baths</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
                <span>📐 {features.sqm} m²</span>
              </div>
            </div>

            {/* Key Amenities preview */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {features.amenities.slice(0, 3).map(amenity => (
                <span key={amenity} style={{ background: '#f8fafc', color: '#475569', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #f1f5f9' }}>
                  {amenity}
                </span>
              ))}
              {features.amenities.length > 3 && (
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, padding: '0.3rem' }}>
                  +{features.amenities.length - 3} more
                </span>
              )}
            </div>

          </div>
        </div>

        <div style={{ padding: '0 1.75rem 1.75rem 1.75rem', display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            style={{
              flex: 1,
              padding: '0.85rem',
              background: 'transparent',
              color: '#0f172a',
              border: '1px solid #0f172a',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
            Details
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProperty(property);
              setShowInquiryModal(true);
            }}
            style={{
              flex: 1,
              padding: '0.85rem',
              background: '#0f172a',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
          }}>
            Inquire Now
          </button>
        </div>

      </motion.div>
    );
  };

  // Filter properties dynamically
  const parsePrice = (priceStr) => {
    if (!priceStr || priceStr.includes('Request')) return 0;
    return parseInt(priceStr.replace(/,/g, '').replace(' ETB', ''), 10);
  };

  const filteredProperties = luxuryProperties.filter(p => {
    if (selectedFilter !== 'All' && p.type !== selectedFilter) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!p.title.toLowerCase().includes(query) && 
          !p.location.toLowerCase().includes(query) && 
          !p.tags.some(t => t.toLowerCase().includes(query))) return false;
    }
    
    if (priceRange !== 'All') {
      const priceNum = parsePrice(p.price);
      if (priceRange === 'under-150M' && priceNum >= 150000000) return false;
      if (priceRange === '150M-300M' && (priceNum < 150000000 || priceNum > 300000000)) return false;
      if (priceRange === '300M-600M' && (priceNum < 300000000 || priceNum > 600000000)) return false;
      if (priceRange === 'above-600M' && priceNum <= 600000000) return false;
    }
    
    if (bedsFilter !== 'All' && p.type !== 'Commercial') {
      const beds = p.features.beds;
      if (bedsFilter === '3' && beds !== 3) return false;
      if (bedsFilter === '4' && beds !== 4) return false;
      if (bedsFilter === '5' && beds !== 5) return false;
      if (bedsFilter === '6+' && beds < 6) return false;
    }
    
    if (locationFilter !== 'All' && !p.location.includes(locationFilter)) return false;
    
    return true;
  });

  return (
    <div className="public-dashboard-container" style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: '#1e293b', overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      <style>{`
        @media (max-width: 768px) {
          .public-dashboard-container { flex-direction: column !important; }
          .public-sidebar { 
            width: 100% !important; 
            height: auto !important; 
            position: static !important; 
            padding: 1.5rem !important;
            border-right: none !important;
            border-bottom: 1px solid #e2e8f0;
          }
          .public-main { padding: 1rem !important; }
          .public-header { flex-direction: column !important; gap: 1rem !important; align-items: stretch !important; }
          .public-search-wrapper { width: 100% !important; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
          .insights-grid { grid-template-columns: 1fr !important; }
          .details-specs-grid { grid-template-columns: 1fr 1fr !important; }
          .calc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className="public-sidebar" style={{
        width: '280px',
        background: 'white',
        borderRight: '1px solid #e2e8f0',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
          <div style={{ width: '32px', height: '32px', background: '#0f172a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800 }}>E</div>
          <span style={{ fontWeight: 900, fontSize: '1rem', letterSpacing: '1px', color: '#0f172a' }}>ETHIOLUXURY</span>
        </div>

        <nav style={{ flex: 1 }}>
          <NavItem icon={Home} label="Properties" />
          <NavItem icon={Layout} label="Collections" />
          <NavItem icon={TrendingUp} label="Insights" />
        </nav>

        <div style={{ marginTop: 'auto', height: '80px', width: '100%' }} />
      </aside>

      {/* Main Content */}
      <main className="public-main" style={{ flex: 1, padding: '2rem 4rem', maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header Area */}
        <div className="public-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div className="public-search-wrapper" style={{ position: 'relative', width: '400px' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search estates, locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 3.5rem', borderRadius: '50px', border: '1px solid #e2e8f0', background: 'white', outline: 'none', fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            {user && (
              <>
                <button 
                  onClick={handleLogout}
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px',
                    padding: '0.6rem 1.1rem',
                    color: '#ef4444',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.05)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; e.currentTarget.style.color = '#ef4444'; }}
                >
                  <LogOut size={16} /> Logout
                </button>
                <div 
                  onClick={handleAvatarClick}
                  style={{ 
                    width: '44px', 
                    height: '44px', 
                    borderRadius: '50%', 
                    background: getAvatarColor(user.nickname || user.email),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '1.15rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)'; }}
                >
                  {user.profile_picture ? (
                    <img src={user.profile_picture} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user.nickname || user.email).charAt(0).toUpperCase()
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {activeNav === 'Properties' && (
          <>
            {/* Hero Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: 'relative',
                height: '480px',
                borderRadius: '32px',
                overflow: 'hidden',
                marginBottom: '4rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.1)'
              }}
            >
              <img src="/hero.png" alt="Luxury Villa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '4rem'
              }}>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '1rem' }}>EXCELLENCE IN REAL ESTATE</span>
                <h1 style={{ color: 'white', fontSize: '4.5rem', fontWeight: 900, margin: '0 0 1.5rem', lineHeight: 1.1 }}>
                  Ermias Luxury <br /> Management
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 0 2rem', lineHeight: 1.6 }}>
                  Manage and explore the most prestigious real estate portfolio in the Horn of Africa.
                </p>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  <button
                    onClick={() => portfolioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    style={{ padding: '1rem 2.5rem', background: 'white', color: '#0f172a', border: 'none', borderRadius: '50px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                  >
                    Explore Portfolio <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </motion.div>

            {/* "Why Trust Us" Trust Banner */}
            <div style={{ background: '#0f172a', borderRadius: '32px', padding: '3rem 4rem', color: 'white', marginBottom: '4rem', display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ maxWidth: '400px' }}>
                <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>Ermias & Partners</span>
                <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: '0.5rem 0 1rem', lineHeight: '1.2' }}>The Standard for Luxury in Ethiopia</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>We are the leading licensed luxury brokerage in Addis Ababa. Handling the most prestigious assets for discerning global clients.</p>
                <a href="https://wa.me/251911234567" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#25D366', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '50px', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', marginTop: '1.5rem', transition: 'all 0.2s' }}>
                  <MessageCircle size={18} /> Chat on WhatsApp
                </a>
              </div>
              <div style={{ display: 'flex', gap: '3rem' }}>
                <div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10b981' }}>15+</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Years in Business</div>
                </div>
                <div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10b981' }}>250+</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>VIP Transactions</div>
                </div>
                <div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10b981' }}>100%</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Confidentiality</div>
                </div>
              </div>
            </div>

            {/* Property Grid Header & Advanced Filters (Sticky) */}
            <div ref={portfolioRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem', position: 'sticky', top: 0, zIndex: 40, background: '#f8fafc', padding: '1rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Featured Estates</h2>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {['All', 'Villas', 'Penthouses', 'Commercial'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setSelectedFilter(filter)}
                      style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: '50px',
                        border: '1px solid #e2e8f0',
                        background: selectedFilter === filter ? '#0f172a' : 'white',
                        color: selectedFilter === filter ? 'white' : '#64748b',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Advanced Filter Bar */}
              <div style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                <select value={priceRange} onChange={(e) => setPriceRange(e.target.value)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', color: '#475569', fontWeight: 600 }}>
                  <option value="All">All Prices</option>
                  <option value="under-150M">Under 150M ETB</option>
                  <option value="150M-300M">150M - 300M ETB</option>
                  <option value="300M-600M">300M - 600M ETB</option>
                  <option value="above-600M">Above 600M ETB</option>
                </select>
                
                {selectedFilter !== 'Commercial' && (
                  <select value={bedsFilter} onChange={(e) => setBedsFilter(e.target.value)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', color: '#475569', fontWeight: 600 }}>
                    <option value="All">All Bedrooms</option>
                    <option value="3">3 Beds</option>
                    <option value="4">4 Beds</option>
                    <option value="5">5 Beds</option>
                    <option value="6+">6+ Beds</option>
                  </select>
                )}
                
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', color: '#475569', fontWeight: 600 }}>
                  <option value="All">All Locations</option>
                  <option value="Bole">Bole</option>
                  <option value="Sarbet">Sarbet</option>
                  <option value="CMC">CMC</option>
                  <option value="Entoto">Entoto</option>
                  <option value="Bishoftu">Bishoftu</option>
                  <option value="Hawassa">Hawassa</option>
                  <option value="Bahir Dar">Bahir Dar</option>
                  <option value="Kazanchis">Kazanchis</option>
                  <option value="Piassa">Piassa</option>
                  <option value="Arba Minch">Arba Minch</option>
                  <option value="Dire Dawa">Dire Dawa</option>
                  <option value="Adama">Adama</option>
                </select>
              </div>
            </div>

            {/* Property Grid */}
            <div className="property-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '3rem', marginBottom: '4rem' }}>
              {filteredProperties.map(property => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onClick={() => setSelectedProperty(property)}
                />
              ))}
            </div>

            {/* Why Trust Us Section */}
            <div style={{ background: 'white', borderRadius: '24px', padding: '2rem 1.5rem', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Why Trust Us</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0f172a', margin: '0' }}>Trust isn't given — it's earned. We've earned it.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> A Decade of Excellence</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>10 years. Countless legacies. Zero shortcuts.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> Proven Track Record</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>180+ deals closed. Results speak louder.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> Global Reach, Local Roots</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>World-class reach. Ethiopian heart.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> 100% Legally Compliant</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>Every deal. By the book. No exceptions.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> Full-Cycle Concierge</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>We stay long after the sale.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ fontSize: '1.1rem' }}>✅</span> Built on Referrals</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>Our best ads? Our happy clients.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {activeNav === 'Collections' && (
          <div>
            {selectedCollection === null ? (
              <>
                <div style={{ marginBottom: '3rem' }}>
                  <h2 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 0.5rem' }}>Curated Collections</h2>
                  <p style={{ color: '#64748b', fontSize: '1.05rem', margin: 0 }}>Explore handpicked groups of our most prestigious estates tailored to unique lifestyles.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '2.5rem', marginBottom: '4rem' }}>
                  {luxuryCollections.map(collection => (
                    <motion.div
                      key={collection.id}
                      whileHover={{ y: -8, scale: 1.01 }}
                      onClick={() => setSelectedCollection(collection)}
                      style={{
                        background: 'white',
                        borderRadius: '24px',
                        overflow: 'hidden',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '420px',
                        position: 'relative'
                      }}
                    >
                      <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
                        <img src={collection.image} alt={collection.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{
                          position: 'absolute',
                          top: '1.25rem',
                          right: '1.25rem',
                          background: 'white',
                          padding: '0.4rem 1rem',
                          borderRadius: '50px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          color: collection.color,
                          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                        }}>
                          {collection.count} Properties
                        </div>
                      </div>

                      <div style={{ padding: '1.75rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 0.5rem' }}>{collection.name}</h3>
                          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>{collection.tagline}</p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: collection.color, fontWeight: 800, fontSize: '0.85rem' }}>
                          Explore Collection <ArrowRight size={16} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                  <button
                    onClick={() => setSelectedCollection(null)}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: '50px',
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#64748b',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    ← Back to Collections
                  </button>
                </div>

                <div style={{ marginBottom: '3rem' }}>
                  <span style={{ color: selectedCollection.color, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Curated Grouping</span>
                  <h2 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', margin: '0.5rem 0' }}>{selectedCollection.name}</h2>
                  <p style={{ color: '#64748b', fontSize: '1.05rem', margin: 0 }}>{selectedCollection.tagline}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '3rem', marginBottom: '4rem' }}>
                  {luxuryProperties
                    .filter(p => selectedCollection.propertyIds.includes(p.id))
                    .map(property => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        onClick={() => setSelectedProperty(property)}
                      />
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeNav === 'Insights' && (
          <div>
            <div style={{ marginBottom: '3rem' }}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 0.5rem' }}>Portfolio Insights</h2>
              <p style={{ color: '#64748b', fontSize: '1.05rem', margin: 0 }}>Real-time market analytics, valuation trackers, and holding return calculators for Ethiopian prime real estate.</p>
            </div>

            {/* Insights Market Indicator Grid */}
            <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '2rem', marginBottom: '4rem' }}>
              {[
                { title: 'Average Portfolio Price', value: '285,000,000 ETB', trend: '+12.4% this quarter', desc: 'Reflects high-growth premium residential developments across Bole, CMC, and Hawassa.' },
                { title: 'Year-on-Year Growth', value: '18.2%', trend: '+3.1% YoY', desc: 'Driven by robust international corporate leasing demand and premium land valuation spikes.' },
                { title: 'Estimated Rental Yield', value: '8.5%', trend: 'Stable Yield', desc: 'Standard average yield across prime diplomatic residential properties and corporate towers.' }
              ].map((indicator, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'white',
                    padding: '2rem',
                    borderRadius: '24px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{indicator.title}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', margin: '0.75rem 0' }}>
                    <span style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0f172a' }}>{indicator.value}</span>
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.6rem', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800 }}>{indicator.trend}</span>
                  </div>
                  <p style={{ color: '#64748b', fontSize: '0.8rem', lineHeight: '1.5', margin: 0 }}>{indicator.desc}</p>
                </div>
              ))}
            </div>

            {/* Interactive Investment Appreciation Calculator */}
            <div style={{
              background: 'white',
              borderRadius: '32px',
              border: '1px solid #e2e8f0',
              padding: '3rem',
              boxShadow: '0 10px 40px rgba(0,0,0,0.03)',
              marginBottom: '4rem'
            }}>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', margin: '0 0 1.5rem' }}>Holding Valuation Calculator</h3>

              <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
                {/* Sliders Input Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>
                      <span>Initial Investment (ETB)</span>
                      <span style={{ color: '#0284c7' }}>{(investmentAmount / 1000000).toFixed(0)}M ETB</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="5"
                      value={investmentAmount / 1000000}
                      onChange={e => setInvestmentAmount(Number(e.target.value) * 1000000)}
                      style={{ width: '100%', height: '6px', borderRadius: '3px', background: '#cbd5e1', outline: 'none', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>
                      <span>Holding Period</span>
                      <span style={{ color: '#0284c7' }}>{holdingPeriod} Years</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="1"
                      value={holdingPeriod}
                      onChange={e => setHoldingPeriod(Number(e.target.value))}
                      style={{ width: '100%', height: '6px', borderRadius: '3px', background: '#cbd5e1', outline: 'none', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>
                      <span>Expected Annual Appreciation (%)</span>
                      <span style={{ color: '#0284c7' }}>{appreciationRate}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="25"
                      step="1"
                      value={appreciationRate}
                      onChange={e => setAppreciationRate(Number(e.target.value))}
                      style={{ width: '100%', height: '6px', borderRadius: '3px', background: '#cbd5e1', outline: 'none', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Live Output Valuation Display */}
                <div style={{ background: '#f8fafc', padding: '2.5rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Projected Future Valuation</span>
                    <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0f172a', margin: '0.5rem 0' }}>
                      {Math.round(investmentAmount * Math.pow(1 + (appreciationRate / 100), holdingPeriod)).toLocaleString()} ETB
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Net Capital Gain</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                        +{Math.round((investmentAmount * Math.pow(1 + (appreciationRate / 100), holdingPeriod)) - investmentAmount).toLocaleString()} ETB
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Est. Annual Rental Yield</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                        {Math.round((investmentAmount * Math.pow(1 + (appreciationRate / 100), holdingPeriod)) * 0.085).toLocaleString()} ETB
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Market News Bulletins */}
            <div style={{ background: '#f8fafc', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '2.5rem' }}>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem' }}>Real Estate Editorial Bulletins</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {[
                  { tag: 'infrastructure', headline: 'CMC LRT Expansion corridor triggers premium retail rental growth of 22%', date: 'May 15, 2026' },
                  { tag: 'tourism & leisure', headline: 'Entoto forest green developments spur high demand for premium timber-framed eco-villas', date: 'May 12, 2026' },
                  { tag: 'regional centers', headline: 'Adama trade corridor corporate headquarters occupancy levels touch historic high of 94%', date: 'May 08, 2026' }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block', marginBottom: '0.5rem' }}>{item.tag}</span>
                      <h5 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{item.headline}</h5>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Property Detail Modal overlay */}
      {selectedProperty && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '2rem'
        }} onClick={() => setSelectedProperty(null)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: 'white',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              borderRadius: '32px',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Dynamic perspective header view with smooth opacity swap */}
            <div style={{ position: 'relative', height: '360px', overflow: 'hidden', background: '#0f172a' }}>
              <img
                src={selectedProperty.views[activeModalView]}
                alt={selectedProperty.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'all 0.3s ease-in-out' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.85) 0%, transparent 60%)' }} />
              <button
                onClick={() => setSelectedProperty(null)}
                style={{
                  position: 'absolute',
                  top: '1.5rem',
                  right: '1.5rem',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'white',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '1rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10
                }}
              >
                ✕
              </button>

              <div style={{ position: 'absolute', bottom: '2rem', left: '2rem', right: '2rem' }}>
                <span style={{ background: '#10b981', color: 'white', padding: '0.4rem 1rem', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', display: 'inline-block', marginBottom: '0.75rem' }}>{selectedProperty.type}</span>
                <h2 style={{ color: 'white', fontSize: '2.25rem', fontWeight: 900, margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{selectedProperty.title}</h2>
              </div>
            </div>

            {/* Interactive front/side/top view elevation selector */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
              padding: '1.25rem 2.5rem',
              background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9'
            }}>
              {[
                { key: 'front', label: 'Front View (Elevation)' },
                { key: 'side', label: 'Side View (Elevation)' },
                { key: 'top', label: 'Top View (Axonometric Model)' }
              ].map(view => (
                <button
                  key={view.key}
                  onClick={() => setActiveModalView(view.key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 0.6rem 0.5rem 0.6rem',
                    borderRadius: '16px',
                    border: '2px solid',
                    borderColor: activeModalView === view.key ? '#0f172a' : '#e2e8f0',
                    background: activeModalView === view.key ? '#0f172a' : 'white',
                    color: activeModalView === view.key ? 'white' : '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: activeModalView === view.key ? '0 4px 12px rgba(15,23,42,0.15)' : 'none'
                  }}
                >
                  <div style={{
                    width: '100%',
                    height: '56px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginBottom: '0.2rem'
                  }}>
                    <img
                      src={selectedProperty.views[view.key]}
                      alt={view.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{view.label}</span>
                </button>
              ))}
            </div>

            {/* Details Panel */}
            <div style={{ padding: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                    <MapPin size={18} color="#0f172a" />
                    <span style={{ color: '#0f172a', fontWeight: 600 }}>{selectedProperty.location}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>PRESTIGIOUS DISTRICT</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a' }}>{selectedProperty.price}</div>
                  <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 800 }}>ESTIMATED MARKET VALUE</div>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="details-specs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '20px', marginBottom: '2rem' }}>
                {selectedProperty.type === 'Commercial' ? (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Lease Rate</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{selectedProperty.commercialDetails?.leasePriceSqm || 'Price on Request'}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Efficiency</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{selectedProperty.commercialDetails?.efficiency || 'N/A'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Bedrooms</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{selectedProperty.features.beds} Beds</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Bathrooms</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{selectedProperty.features.baths} Baths</div>
                    </div>
                  </>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Area</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{selectedProperty.features.sqm} m²</div>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '2.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>Estate Overview</h3>
                {selectedProperty.story && (
                  <p style={{ color: '#0f172a', fontSize: '1.05rem', fontStyle: 'italic', fontWeight: 600, marginBottom: '1rem', borderLeft: '4px solid #10b981', paddingLeft: '1rem' }}>
                    "{selectedProperty.story}"
                  </p>
                )}
                <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.7', margin: 0 }}>
                  {selectedProperty.description}
                </p>
              </div>

              {/* Luxury Amenities */}
              <div style={{ marginBottom: '2.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Bespoke Property Features</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {selectedProperty.features.amenities.map(amenity => (
                    <div key={amenity} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.95rem', color: '#334155', fontWeight: 500 }}>
                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                      <span>{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => setShowInquiryModal(true)}
                style={{
                  width: '100%',
                  padding: '1.1rem',
                  background: '#0f172a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '16px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 10px 25px rgba(15,23,42,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem'
                }}
              >
                Schedule Private VIP Tour <ArrowRight size={20} />
              </button>

            </div>
          </motion.div>
        </div>
      )}

      {/* Re-designed perfect custom Success Modal overlay */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem'
        }} onClick={() => setShowSuccessModal(false)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: 'white',
              width: '100%',
              maxWidth: '440px',
              borderRadius: '28px',
              padding: '2.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Success Checkmark Ring */}
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: '#f0fdf4',
              border: '2px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a',
              margin: '0 auto 1.5rem'
            }}>
              <CheckCircle size={40} />
            </div>

            <h3 style={{
              margin: '0 0 0.75rem',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0f172a'
            }}>
              Inquiry Confirmed!
            </h3>

            <p style={{
              color: '#64748b',
              lineHeight: '1.6',
              marginBottom: '2rem',
              fontSize: '0.95rem',
              fontWeight: 500
            }}>
              Thank you for choosing EthioLuxury. A dedicated VIP Concierge Manager has received your request and will contact you directly within the hour to coordinate your private premium tour.
            </p>

            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '16px',
                background: '#0f172a',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
                transition: 'background 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = '#1e293b'}
              onMouseOut={e => e.currentTarget.style.background = '#0f172a'}
            >
              Back to Estates
            </button>
          </motion.div>
        </div>
      )}

      {/* Inquiry Modal */}
      {showInquiryModal && selectedProperty && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem'
        }} onClick={() => setShowInquiryModal(false)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: 'white',
              width: '100%',
              maxWidth: '500px',
              borderRadius: '28px',
              padding: '2.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
                onClick={() => setShowInquiryModal(false)}
                style={{
                  position: 'absolute',
                  top: '1.5rem',
                  right: '1.5rem',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '1rem'
                }}
              >
                ✕
              </button>
              
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>Inquire Now</h3>
            <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>Send a direct inquiry for <strong style={{ color: '#0f172a' }}>{selectedProperty.title}</strong>.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <input type="text" placeholder="Full Name" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <input type="email" placeholder="Email Address" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <input type="text" placeholder="Phone Number" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <textarea defaultValue={`I would like to schedule a viewing and inquire about ${selectedProperty.title}.`} rows="4" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem', resize: 'none' }}></textarea>
              
              <button
                onClick={() => {
                  setShowInquiryModal(false);
                  setShowSuccessModal(true);
                  setSelectedProperty(null);
                }}
                style={{
                  width: '100%',
                  padding: '1.1rem',
                  borderRadius: '12px',
                  background: '#0f172a',
                  color: 'white',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
                  marginTop: '0.5rem'
                }}
              >
                Send Inquiry
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global Contact Section */}
      <div style={{ background: '#0f172a', padding: '4rem 2rem', color: 'white', marginTop: '4rem' }} className="contact-grid-wrapper">
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }} className="contact-grid">
          <div>
            <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>Get In Touch</span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '1rem 0 1.5rem', lineHeight: '1.2' }}>Let's find your<br/>dream estate.</h2>
            <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '3rem', lineHeight: '1.6' }}>Our luxury real estate experts are available 24/7 to assist you with private tours, investment inquiries, and exclusive off-market listings.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={20} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Call Us Directly</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>+251 911 234 567</div>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mail size={20} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Email Address</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>vip@ethioluxury.com</div>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={20} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Corporate Office</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Bole Medhanialem, Addis Ababa</div>
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ background: 'white', borderRadius: '24px', padding: '3rem' }}>
            <h3 style={{ color: '#0f172a', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 2rem' }}>Send a Message</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <input type="text" placeholder="Full Name" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <input type="email" placeholder="Email Address" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <input type="text" placeholder="Phone Number" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <textarea placeholder="How can we help you?" rows="4" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem', resize: 'none' }}></textarea>
              <button onClick={() => setShowSuccessModal(true)} style={{ padding: '1.1rem', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}>Submit Inquiry</button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Bar */}
      <div style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(10px)',
        padding: '0.5rem 1rem',
        borderRadius: '50px',
        display: 'flex',
        gap: '0.5rem',
        zIndex: 50,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }} className="floating-action-bar">
        <a href="tel:+251911234567" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#38bdf8', color: '#0f172a', padding: '0.75rem 1.25rem', borderRadius: '50px', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none', transition: 'all 0.2s' }}>
          <Phone size={16} /> Call Now
        </a>
        <a href="https://wa.me/251911234567" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#25D366', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '50px', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none', transition: 'all 0.2s' }}>
          <MessageCircle size={16} /> WhatsApp
        </a>
        <button onClick={() => setShowBrochureModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '50px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>
          <FileText size={16} /> Request Brochure
        </button>
      </div>

      {/* Brochure Request Modal */}
      {showBrochureModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem'
        }} onClick={() => setShowBrochureModal(false)}>
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} style={{ background: 'white', width: '100%', maxWidth: '440px', borderRadius: '28px', padding: '2.5rem', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowBrochureModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', width: '36px', height: '36px', borderRadius: '50%', background: '#f1f5f9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>Request Brochure</h3>
            <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>Receive our exclusive portfolio prospectus instantly.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <input type="text" placeholder="Full Name" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <input type="email" placeholder="Email Address" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }} />
              <select style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem', color: '#475569' }}>
                <option value="">Select Property Interest</option>
                <option value="villas">Luxury Villas</option>
                <option value="commercial">Commercial Towers</option>
                <option value="penthouses">Sky Penthouses</option>
                <option value="all">Full Portfolio</option>
              </select>
              <button onClick={() => { setShowBrochureModal(false); setShowSuccessModal(true); }} style={{ width: '100%', padding: '1.1rem', borderRadius: '12px', background: '#0f172a', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', marginTop: '0.5rem' }}>Send Prospectus</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Styles for the page */}
      <style>{`
        *:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
        button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
        
        @media (max-width: 1100px) {
          aside { width: 80px !important; padding: 2rem 1rem !important; }
          aside span, aside nav span { display: none; }
          main { padding: 2rem !important; }
          h1 { font-size: 3rem !important; }
        }
        @media (max-width: 768px) {
          aside { display: none !important; }
          main { padding: 1rem !important; }
          .property-grid { grid-template-columns: 1fr !important; gap: 1.5rem !important; }
          div[style*="gridTemplateColumns: repeat(auto-fit"] { grid-template-columns: 1fr !important; }
          h1 { font-size: 2.5rem !important; }
          .hero-section { height: 350px !important; }
          .contact-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
          .contact-grid-wrapper { padding: 3rem 1rem !important; border-radius: 0 !important; }
          .floating-action-bar { width: 90%; justify-content: space-between; padding: 0.5rem; }
          .floating-action-bar a, .floating-action-bar button { padding: 0.75rem 0.5rem !important; flex: 1; justify-content: center; font-size: 0.75rem !important; }
        }
      `}</style>
    </div>
  );
};

export default PublicDashboard;
