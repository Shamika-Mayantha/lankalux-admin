-- Website content managed from the admin console and shown on lankalux.com.
-- Additive only. Does not drop existing data.
-- Only the service role (admin API routes) reads or writes these tables;
-- lankalux.com reads published content through /api/site-content.

CREATE TABLE IF NOT EXISTS website_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL DEFAULT 'home',
  quote TEXT NOT NULL,
  author TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_reviews_page_order
  ON website_reviews (page, sort_order);

CREATE TABLE IF NOT EXISTS website_photos (
  path TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE website_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_photos ENABLE ROW LEVEL SECURITY;

-- Seed with the reviews currently hard-coded on lankalux.com, once.
INSERT INTO website_reviews (page, quote, author, sort_order)
SELECT v.page, v.quote, v.author, v.sort_order
FROM (VALUES
  ('home', 'While visiting the Kalutara temple, our chauffeur Shantha welcomed us into his nearby home. His wife prepared a homemade meal, let us try making hoppers, and even gifted us the equipment. This was not charged at all, just pure generosity, and became one of our favorite moments of the trip.', 'Michael & Amina, Dubai', 10),
  ('home', 'We never felt rushed with Shantha. If we wanted to stop somewhere or change plans a bit, it was never a problem. That made the trip feel relaxed.', 'Arjun & Neha, India', 20),
  ('home', 'Long drives can be tiring, but with Shantha it didn’t feel like that. Smooth driving, good music, and the Voxy had plenty of space for us and our luggage.', 'Omar A, Dubai', 30),
  ('home', 'Shantha was always calm and friendly, even on long driving days. The Toyota Voxy was very comfortable and clean, so traveling never felt tiring.', 'Dmitry K, Russia', 40),
  ('home', 'Everything felt quite easy throughout the trip. Pickups were on time, the car was comfortable, and we didn’t really have to think about planning once we arrived. It was a very smooth experience overall.', 'Min-Joon & Soo-Yeon, South Korea', 50),
  ('home', 'Exactly the kind of journey we wanted, without stress or compromises.', 'Emma R, United Kingdom', 60),
  ('home', 'Excellent trip organization. Every detail was thoughtfully planned, and we felt like special guests throughout our journey.', 'Ivan & Elena P, Russia', 70),
  ('home', 'Sri Lanka was amazing. The culture, the people, and the food were all unforgettable. We enjoyed great meals, fun nights, and so many memorable moments. Big thanks to LankaLux for organizing everything so well.', 'Oren & Maya, Israel', 80),
  ('home', 'An absolutely incredible experience from start to finish. The attention to detail and personalized service exceeded all our expectations.', 'Jennifer & Michael T, United States', 90),
  ('signature-journey', 'This journey was the perfect introduction to Sri Lanka. We experienced everything from ancient temples in Kandy to tea plantations in Nuwara Eliya, wildlife in Yala, and beautiful beaches. The itinerary was perfectly balanced, and our chauffeur made every day smooth and enjoyable.', 'Sarah & James W, Australia', 10),
  ('signature-journey', 'The Signature Journey exceeded our expectations. We loved the variety—cultural sites, wildlife safaris, scenic train rides, and beach time. Every detail was thoughtfully planned, and we never felt rushed. The hotels were excellent, and our driver was knowledgeable and friendly throughout.', 'Thomas & Maria L, Germany', 20),
  ('signature-journey', 'From Sigiriya''s ancient rock fortress to the tea plantations and Yala''s wildlife, this journey covered all of Sri Lanka''s highlights beautifully. The pace was perfect, allowing us to truly experience each place without feeling rushed. Our chauffeur''s local knowledge made every stop more meaningful.', 'Rachel & Ben C, New Zealand', 30),
  ('signature-journey', 'What impressed us most was how seamlessly everything flowed—from cultural sites to nature to relaxation. The hotels were carefully selected, the timing was perfect, and we never had to worry about logistics. It truly felt like a bespoke experience tailored just for us.', 'Luca & Francesca M, Italy', 40),
  ('hill-country-journey', 'The scenic train journey from Kandy to Ella was absolutely breathtaking. Rolling through tea plantations with misty mountains all around—it was like something from a postcard. The hill country towns were charming, and the cool climate was a welcome change from the coast.', 'Robert & Anna H, Sweden', 10),
  ('hill-country-journey', 'We loved exploring the tea plantations and learning about Ceylon tea. Nuwara Eliya felt like a different world with its colonial architecture and cool mountain air. The train ride was definitely a highlight—one of the most beautiful journeys we''ve ever taken.', 'Yuki & Hiroshi T, Japan', 20),
  ('hill-country-journey', 'The hill country exceeded all our expectations. The tea factory tour was fascinating, and the views from the train were absolutely stunning. Ella''s Nine Arch Bridge was a photographer''s dream, and the cool mountain air was so refreshing after the coastal heat.', 'Daniel & Emma S, Switzerland', 30),
  ('hill-country-journey', 'Perfect for those who love mountains and trains! The journey through the hill country was peaceful and beautiful. We especially enjoyed the tea tasting sessions and the charming guesthouses. It felt like stepping back in time while enjoying modern comforts.', 'Hans & Ingrid V, Norway', 40),
  ('nature-wildlife-journey', 'As wildlife enthusiasts, this journey was a dream come true. We saw leopards in Yala, elephants in Udawalawe, and so many birds. The early morning safaris were magical, and our guide''s knowledge of the animals and their behavior made each game drive unforgettable.', 'David & Lisa K, Canada', 10),
  ('nature-wildlife-journey', 'The wildlife encounters exceeded all our expectations. From spotting a leopard with cubs to watching elephants bathe, every moment was incredible. The parks were well-chosen, and the timing of the safaris was perfect for seeing the most activity.', 'Sophie M, France', 20),
  ('nature-wildlife-journey', 'We''ve been on safaris in Africa, but Sri Lanka''s wildlife parks offered something completely unique. The diversity of species, from sloth bears to leopards to countless birds, was remarkable. Our chauffeur knew exactly where to go and when, maximizing our chances of incredible sightings.', 'Alexandra & Peter F, South Africa', 30),
  ('nature-wildlife-journey', 'The bird watching was exceptional—we spotted over 50 different species. But the highlight was definitely seeing a leopard in Yala and a family of elephants in Udawalawe. The early morning safaris were worth every moment, and the naturalists'' expertise added so much to the experience.', 'Marcus & Julia N, Netherlands', 40),
  ('coastal-retreat-journey', 'The coastal journey was exactly what we needed—pure relaxation. The beaches were stunning, the seafood was incredible, and we loved the laid-back atmosphere. Whale watching was a highlight, and the sunsets were absolutely magical every evening.', 'Charlotte & Mark B, United Kingdom', 10),
  ('coastal-retreat-journey', 'Perfect for beach lovers! We spent our days swimming, surfing, and just soaking up the sun. The coastal towns had great restaurants, and the people were so friendly. It was the perfect way to unwind and recharge.', 'Carlos & Elena R, Spain', 20),
  ('coastal-retreat-journey', 'Galle Fort was a wonderful surprise—such a beautiful blend of history and modern cafes. The beaches at Mirissa and Unawatuna were pristine, and we loved the fresh seafood everywhere. This journey was pure relaxation from start to finish.', 'Sophie & Pierre D, Belgium', 30),
  ('coastal-retreat-journey', 'We came for the beaches and stayed for everything else. The coastal drive was scenic, the beachfront hotels were perfect, and the water was warm and inviting. Surfing lessons in Arugam Bay were a highlight, and the local food was incredible.', 'Mike & Sarah J, United States', 40)
) AS v(page, quote, author, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM website_reviews);
