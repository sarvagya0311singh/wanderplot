export interface SampleItinerary {
  slug: 'ladakh' | 'kerala' | 'varanasi' | 'andaman';
  title: string;
  selectedDestination: { name: string; state: string; coordinates: { lat: number; lng: number }; images: string[] };
  inputs: { month: number; days: number; groupType: string; pace: string; budget: number; originCoords?: { lat: number; lng: number } };
  matchScore?: number;
  itinerary: {
    summary: string;
    days: {
      day: number;
      title: string;
      morning: string;
      afternoon: string;
      evening: string;
      accommodation: string;
      estimatedCost: number;
      tips?: string;
      locations?: string[];
    }[];
    budgetBreakdown: { transport: number; accommodation: number; food: number; activities: number; misc: number };
    packingList: string[];
  };
}

export const sampleItineraries: Record<string, SampleItinerary> = {
  ladakh: {
    slug: 'ladakh',
    title: '6 Days in Ladakh',
    selectedDestination: {
      name: 'Ladakh',
      state: 'Ladakh',
      coordinates: { lat: 34.1526, lng: 77.5771 },
      images: ['/destinations/ladakh.jpg'],
    },
    inputs: { month: 7, days: 6, groupType: 'friends', pace: 'moderate', budget: 45000 },
    matchScore: 95,
    itinerary: {
      summary: 'A breathtaking high-altitude adventure through the barren beauty of Ladakh. Experience ancient monasteries, pristine blue lakes, and the raw power of the Himalayas.',
      days: [
        {
          day: 1,
          title: 'Acclimatization in Leh',
          morning: 'Arrive in Leh. Rest at your hotel to acclimatize to the high altitude. Drink plenty of water.',
          afternoon: 'Gentle walk to the local Leh market to soak in the atmosphere. Visit the serene Shanti Stupa for a panoramic view of the city.',
          evening: 'Light dinner at a local Tibetan café. Early bedtime to prepare for the days ahead.',
          accommodation: 'Grand Dragon Ladakh or similar',
          estimatedCost: 3500,
          tips: 'Do not rush on day 1. Acclimatization is absolutely critical.',
          locations: ['Leh Market', 'Shanti Stupa'],
        },
        {
          day: 2,
          title: 'Monasteries and Magnetic Hill',
          morning: 'Drive along the Indus river. Visit the magnificent Thiksey Monastery, resembling the Potala Palace.',
          afternoon: 'Head towards Magnetic Hill. Experience the anti-gravity phenomenon and visit the Gurdwara Pathar Sahib.',
          evening: 'Return to Leh. Enjoy traditional Thukpa or Momos at The Tibetan Kitchen.',
          accommodation: 'Grand Dragon Ladakh or similar',
          estimatedCost: 4500,
          locations: ['Thiksey Monastery', 'Magnetic Hill', 'Gurdwara Pathar Sahib'],
        },
        {
          day: 3,
          title: 'Journey to Nubra Valley',
          morning: 'Drive across Khardung La, one of the highest motorable passes in the world (18,380 ft). Enjoy the thrilling ride.',
          afternoon: 'Descend into the beautiful Nubra Valley. Check into your luxury camp in Hunder.',
          evening: 'Ride the double-humped Bactrian camels across the cold desert sand dunes of Hunder.',
          accommodation: 'Nubra Organic Retreat or similar',
          estimatedCost: 8000,
          tips: 'Keep warm clothes handy for the Khardung La pass.',
          locations: ['Khardung La', 'Hunder Sand Dunes'],
        },
        {
          day: 4,
          title: 'Turtuk Village Excursion',
          morning: 'Day trip to Turtuk, a picturesque village near the LoC with a unique Balti culture.',
          afternoon: 'Explore the village, interact with locals, and enjoy a traditional Balti lunch with apricot-based dishes.',
          evening: 'Return to your camp in Hunder for a bonfire under a spectacularly starry sky.',
          accommodation: 'Nubra Organic Retreat or similar',
          estimatedCost: 6000,
          locations: ['Turtuk Village'],
        },
        {
          day: 5,
          title: 'The Azure Pangong Tso',
          morning: 'Drive from Nubra to Pangong Tso via the Shyok river route. The rugged landscape is incredibly photogenic.',
          afternoon: 'Arrive at Pangong Tso. The lake changes colors from deep blue to turquoise. Check into a lakeside camp.',
          evening: 'Stroll along the lake as the sun sets. The temperature drops sharply, so dress in layers.',
          accommodation: 'Pangong Hermitage or similar',
          estimatedCost: 8500,
          tips: 'Do not litter around the pristine lake.',
          locations: ['Pangong Tso'],
        },
        {
          day: 6,
          title: 'Return to Leh & Departure',
          morning: 'Watch a mesmerizing sunrise over Pangong Tso. Depart for Leh via the Chang La pass.',
          afternoon: 'Arrive in Leh. Last-minute souvenir shopping for Pashmina and silver jewelry.',
          evening: 'Head to the Kushok Bakula Rimpochee Airport for your flight back home.',
          accommodation: 'None',
          estimatedCost: 4000,
          locations: ['Chang La', 'Leh Airport'],
        },
      ],
      budgetBreakdown: { transport: 12000, accommodation: 15000, food: 6000, activities: 2500, misc: 4000 },
      packingList: ['Thermal wear', 'Heavy jacket', 'Sunscreen (SPF 50+)', 'Sunglasses', 'Diamox (for altitude)', 'Sturdy shoes'],
    }
  },
  kerala: {
    slug: 'kerala',
    title: '5 Days in Kerala Backwaters',
    selectedDestination: {
      name: 'Kerala',
      state: 'Kerala',
      coordinates: { lat: 9.9312, lng: 76.2673 },
      images: ['/destinations/kerala.jpg'],
    },
    inputs: { month: 11, days: 5, groupType: 'couple', pace: 'relaxed', budget: 35000 },
    matchScore: 92,
    itinerary: {
      summary: 'A tranquil journey through "God’s Own Country". Glide through emerald backwaters, relax on sandy beaches, and savor the rich, spicy flavors of coastal India.',
      days: [
        {
          day: 1,
          title: 'Arrival in Kochi',
          morning: 'Arrive in Kochi. Check into a heritage hotel in Fort Kochi. Freshen up and enjoy local filter coffee.',
          afternoon: 'Explore the historic Fort Kochi area. See the iconic Chinese Fishing Nets and the centuries-old St. Francis Church.',
          evening: 'Attend a mesmerizing Kathakali dance performance at a local cultural center.',
          accommodation: 'Brunton Boatyard or similar',
          estimatedCost: 5000,
          locations: ['Fort Kochi', 'Chinese Fishing Nets'],
        },
        {
          day: 2,
          title: 'Munnar Tea Gardens',
          morning: 'Scenic drive up to Munnar, surrounded by endless rolling tea estates. The air turns cool and crisp.',
          afternoon: 'Visit the Tata Tea Museum. Take a guided stroll through the verdant tea gardens and enjoy freshly brewed tea.',
          evening: 'Relax at your resort overlooking the misty valleys. Enjoy a traditional Kerala thali for dinner.',
          accommodation: 'Blanket Hotel & Spa or similar',
          estimatedCost: 6500,
          tips: 'The roads to Munnar are winding; keep motion sickness pills handy if needed.',
          locations: ['Munnar', 'Tata Tea Museum'],
        },
        {
          day: 3,
          title: 'Houseboat in Alleppey',
          morning: 'Drive down from Munnar to Alleppey. Board your private traditional Kettuvallam (houseboat) by noon.',
          afternoon: 'Cruise slowly through the tranquil backwaters, passing lush paddy fields and small village communities. Enjoy a freshly prepared Kerala-style lunch on board.',
          evening: 'The boat docks for the night. Enjoy a quiet, romantic dinner under the stars on the deck.',
          accommodation: 'Premium AC Houseboat',
          estimatedCost: 12000,
          locations: ['Alleppey Backwaters'],
        },
        {
          day: 4,
          title: 'Marari Beach Relaxation',
          morning: 'Disembark from the houseboat after breakfast. Take a short drive to the pristine Marari Beach.',
          afternoon: 'Spend the day unwinding on the white sands. Enjoy an Ayurvedic spa treatment at your resort.',
          evening: 'Watch a stunning sunset over the Arabian Sea. Enjoy fresh seafood for dinner.',
          accommodation: 'Marari Beach Resort or similar',
          estimatedCost: 8000,
          locations: ['Marari Beach'],
        },
        {
          day: 5,
          title: 'Departure',
          morning: 'Enjoy a final, lazy breakfast by the beach. Take one last walk along the shore.',
          afternoon: 'Drive back to Cochin International Airport for your onward journey.',
          evening: 'Flight back home.',
          accommodation: 'None',
          estimatedCost: 2000,
          locations: ['Cochin Airport'],
        },
      ],
      budgetBreakdown: { transport: 6000, accommodation: 16000, food: 7000, activities: 4000, misc: 2000 },
      packingList: ['Light cotton clothing', 'Mosquito repellent', 'Sun hat', 'Swimwear', 'Umbrella (if monsoon)'],
    }
  },
  varanasi: {
    slug: 'varanasi',
    title: '3 Days of Spirituality in Varanasi',
    selectedDestination: {
      name: 'Varanasi',
      state: 'Uttar Pradesh',
      coordinates: { lat: 25.3176, lng: 82.9739 },
      images: ['/destinations/varanasi.jpg'],
    },
    inputs: { month: 10, days: 3, groupType: 'solo', pace: 'fast', budget: 15000 },
    matchScore: 88,
    itinerary: {
      summary: 'Dive deep into the ancient soul of India. Experience the profound spirituality of the ghats, the chaotic energy of the narrow alleys, and the mesmerizing Ganga Aarti.',
      days: [
        {
          day: 1,
          title: 'The Heart of the City',
          morning: 'Arrive in Varanasi. Check into a guesthouse near the ghats. Walk to the Kashi Vishwanath Temple for darshan.',
          afternoon: 'Explore the labyrinthine alleys (galis). Try local street food like Kachori Sabzi and thick creamy Lassi at Blue Lassi.',
          evening: 'Head to Dashashwamedh Ghat for the spectacular Ganga Aarti. Take a boat ride to watch it from the river.',
          accommodation: 'BrijRama Palace or a traditional guesthouse',
          estimatedCost: 3500,
          locations: ['Kashi Vishwanath Temple', 'Dashashwamedh Ghat'],
        },
        {
          day: 2,
          title: 'Sunrise on the Ganges',
          morning: 'Wake up before dawn for a serene sunrise boat ride on the Ganges. Witness the rituals of life and death along the ghats.',
          afternoon: 'Visit Sarnath, where Lord Buddha gave his first sermon. Explore the Dhamek Stupa and the archaeological museum.',
          evening: 'Return to the city. Walk from Assi Ghat to Manikarnika Ghat to truly absorb the city\'s complex relationship with life and death.',
          accommodation: 'BrijRama Palace or a traditional guesthouse',
          estimatedCost: 4500,
          tips: 'Be respectful and avoid taking photos at the cremation ghats.',
          locations: ['Sarnath', 'Assi Ghat', 'Manikarnika Ghat'],
        },
        {
          day: 3,
          title: 'Weavers and Departure',
          morning: 'Visit the weavers\' district to see the intricate crafting of famous Banarasi silk sarees. A great opportunity for souvenir shopping.',
          afternoon: 'Enjoy a final meal of Chaat at Kashi Chat Bhandar. Pick up some famous Banarasi Paan.',
          evening: 'Transfer to Lal Bahadur Shastri Airport or Varanasi Junction railway station for departure.',
          accommodation: 'None',
          estimatedCost: 4000,
          locations: ['Weavers District'],
        },
      ],
      budgetBreakdown: { transport: 2000, accommodation: 6000, food: 3000, activities: 2000, misc: 2000 },
      packingList: ['Modest clothing', 'Slip-on shoes for temples', 'Camera', 'Hand sanitizer'],
    }
  },
  andaman: {
    slug: 'andaman',
    title: '7 Days in the Andaman Islands',
    selectedDestination: {
      name: 'Andaman',
      state: 'Andaman and Nicobar Islands',
      coordinates: { lat: 11.7401, lng: 92.6586 },
      images: ['/destinations/andaman.jpg'],
    },
    inputs: { month: 1, days: 7, groupType: 'family', pace: 'moderate', budget: 75000 },
    matchScore: 97,
    itinerary: {
      summary: 'A tropical paradise escape. Discover pristine coral reefs, walk on some of Asia’s best beaches, and explore the rich colonial history of Port Blair.',
      days: [
        {
          day: 1,
          title: 'Arrival in Port Blair',
          morning: 'Arrive at Veer Savarkar International Airport. Check in and relax after the flight.',
          afternoon: 'Visit the historic Cellular Jail. Learn about India\'s freedom struggle.',
          evening: 'Watch the moving Light and Sound Show at the Cellular Jail. Dinner at a local seafood restaurant.',
          accommodation: 'Symphony Samudra or similar',
          estimatedCost: 5000,
          locations: ['Cellular Jail'],
        },
        {
          day: 2,
          title: 'Journey to Havelock',
          morning: 'Take a high-speed ferry from Port Blair to Swaraj Dweep (Havelock Island). The journey takes about 2 hours.',
          afternoon: 'Check into your beach resort. Head to Radhanagar Beach, consistently rated among Asia\'s best.',
          evening: 'Swim in the crystal-clear waters and watch an unforgettable sunset. Enjoy a beachfront dinner.',
          accommodation: 'Taj Exotica Resort & Spa or similar',
          estimatedCost: 15000,
          tips: 'Book ferry tickets well in advance during peak season.',
          locations: ['Havelock Island', 'Radhanagar Beach'],
        },
        {
          day: 3,
          title: 'Underwater Exploration',
          morning: 'Early morning scuba diving or sea walking at Elephant Beach. Discover vibrant coral reefs and marine life.',
          afternoon: 'Relax on the beach or try some snorkeling. Enjoy fresh coconut water and local snacks.',
          evening: 'Return to the resort for a relaxed evening and a spa session.',
          accommodation: 'Taj Exotica Resort & Spa or similar',
          estimatedCost: 12000,
          locations: ['Elephant Beach'],
        },
        {
          day: 4,
          title: 'Neil Island Tranquility',
          morning: 'Ferry to Shaheed Dweep (Neil Island). This island is quieter and known for its laid-back vibe.',
          afternoon: 'Visit Bharatpur Beach for its calm, shallow waters perfect for swimming and glass-bottom boat rides.',
          evening: 'Rent a bicycle and ride around the island. Visit Laxmanpur Beach for another stunning sunset.',
          accommodation: 'Sea Shell Neil or similar',
          estimatedCost: 9000,
          locations: ['Neil Island', 'Bharatpur Beach', 'Laxmanpur Beach'],
        },
        {
          day: 5,
          title: 'Natural Wonders',
          morning: 'Visit the Natural Rock Formation (Howrah Bridge) at Neil Island during low tide.',
          afternoon: 'Take the afternoon ferry back to Port Blair.',
          evening: 'Stroll around Marina Park in Port Blair. Enjoy dinner at a rooftop cafe.',
          accommodation: 'Symphony Samudra or similar',
          estimatedCost: 6000,
          locations: ['Natural Rock Formation', 'Marina Park'],
        },
        {
          day: 6,
          title: 'Baratang Island Adventure',
          morning: 'Early morning start for a day trip to Baratang Island. Drive through the dense Jarawa reserve forest.',
          afternoon: 'Take a boat ride through mangrove creeks to reach the fascinating Limestone Caves. Visit the Mud Volcano.',
          evening: 'Return to Port Blair after a long but adventurous day. Farewell dinner.',
          accommodation: 'Symphony Samudra or similar',
          estimatedCost: 8000,
          locations: ['Baratang Island', 'Limestone Caves'],
        },
        {
          day: 7,
          title: 'Departure',
          morning: 'Enjoy a leisurely breakfast. Pick up some shell-based souvenirs from the local markets.',
          afternoon: 'Head to the airport for your flight back home, carrying memories of the turquoise waters.',
          evening: '',
          accommodation: 'None',
          estimatedCost: 2000,
          locations: ['Port Blair Airport'],
        },
      ],
      budgetBreakdown: { transport: 15000, accommodation: 35000, food: 12000, activities: 10000, misc: 3000 },
      packingList: ['Swimwear', 'Reef-safe sunscreen', 'Snorkeling gear (optional)', 'Waterproof bag', 'Light cottons'],
    }
  },
};

export const sampleList = Object.values(sampleItineraries);
