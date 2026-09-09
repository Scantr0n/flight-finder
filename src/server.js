import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { generateMockOffers } from "./mockData.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4100;

const API_BASE = "https://sky-scrapper.p.rapidapi.com";
const API_HOST = "sky-scrapper.p.rapidapi.com";

function rapidHeaders() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    throw new Error("Missing RAPIDAPI_KEY. Add it to flight-finder/.env");
  }
  return { "x-rapidapi-host": API_HOST, "x-rapidapi-key": key };
}

// Resolves an airport code/name to the skyId + entityId this API needs.
async function resolveAirport(query) {
  const params = new URLSearchParams({ query, locale: "en-US" });
  const res = await fetch(`${API_BASE}/api/v1/flights/searchAirport?${params}`, {
    headers: rapidHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Airport lookup failed for "${query}" (${res.status})`);
  }
  const data = await res.json();
  const entries = data.data || [];
  const upper = query.toUpperCase();

  const exactAirport = entries.find(
    (e) => e.navigation?.relevantFlightParams?.skyId === upper
  );
  const anyAirport = entries.find(
    (e) => e.navigation?.relevantFlightParams?.flightPlaceType === "AIRPORT"
  );
  const chosen = exactAirport || anyAirport || entries[0];

  if (!chosen) {
    throw new Error(`No airport found for "${query}"`);
  }
  return {
    skyId: chosen.navigation.relevantFlightParams.skyId,
    entityId: chosen.navigation.relevantFlightParams.entityId,
    name: chosen.navigation.relevantFlightParams.localizedName,
  };
}

async function searchFlightsRaw({ originAirport, destAirport, departDate, returnDate, adults }) {
  const params = new URLSearchParams({
    originSkyId: originAirport.skyId,
    destinationSkyId: destAirport.skyId,
    originEntityId: originAirport.entityId,
    destinationEntityId: destAirport.entityId,
    date: departDate,
    cabinClass: "economy",
    adults,
    sortBy: "best",
    currency: "USD",
    market: "en-US",
    countryCode: "US",
  });
  if (returnDate) params.set("returnDate", returnDate);

  const res = await fetch(`${API_BASE}/api/v2/flights/searchFlights?${params}`, {
    headers: rapidHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flight search failed (${res.status}): ${text}`);
  }
  let payload = await res.json();

  // This API searches asynchronously: the first response can be "incomplete"
  // with a sessionId to poll until results finish assembling.
  let attempts = 0;
  while (payload.data?.context?.status === "incomplete" && attempts < 10) {
    await new Promise((r) => setTimeout(r, 1500));
    const sessionId = payload.data.context.sessionId;
    const pollParams = new URLSearchParams({
      sessionId,
      currency: "USD",
      market: "en-US",
      countryCode: "US",
    });
    const pollRes = await fetch(`${API_BASE}/api/v2/flights/searchIncomplete?${pollParams}`, {
      headers: rapidHeaders(),
    });
    if (!pollRes.ok) break;
    payload = await pollRes.json();
    attempts += 1;
  }

  return payload.data?.itineraries || [];
}

function summarizeItinerary(offer) {
  const itineraries = offer.legs.map((leg) => {
    const segments = leg.segments.map((seg) => ({
      from: seg.origin.flightPlaceId,
      to: seg.destination.flightPlaceId,
      departAt: seg.departure,
      arriveAt: seg.arrival,
      carrier: seg.marketingCarrier?.alternateId || "",
      flightNumber: seg.flightNumber,
      durationHours: Math.round((seg.durationInMinutes / 60) * 100) / 100,
    }));
    return {
      durationHours: Math.round((leg.durationInMinutes / 60) * 100) / 100,
      stops: leg.stopCount,
      segments,
    };
  });

  const totalHours = itineraries.reduce((sum, i) => sum + i.durationHours, 0);
  const maxStops = Math.max(...itineraries.map((i) => i.stops));
  const carriers = [
    ...new Set(itineraries.flatMap((i) => i.segments.map((s) => s.carrier))),
  ];

  return {
    price: offer.price.raw,
    currency: "USD",
    totalHours: Math.round(totalHours * 100) / 100,
    maxStops,
    carriers,
    itineraries,
  };
}

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());

app.get("/api/search", async (req, res) => {
  try {
    const {
      origin,
      destination,
      departDate,
      returnDate,
      adults = "1",
      hourlyValue = "30",
      nonStop = "false",
      demo,
    } = req.query;

    if (!origin || !destination || !departDate) {
      return res.status(400).json({
        error: "origin, destination, and departDate are required",
      });
    }

    const hasKey = Boolean(process.env.RAPIDAPI_KEY);
    const useMock = demo === "true" || !hasKey;

    let rawOffers;
    if (useMock) {
      rawOffers = generateMockOffers({
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        departDate,
        returnDate,
      });
    } else {
      const [originAirport, destAirport] = await Promise.all([
        resolveAirport(origin),
        resolveAirport(destination),
      ]);
      rawOffers = await searchFlightsRaw({
        originAirport,
        destAirport,
        departDate,
        returnDate,
        adults,
      });
    }

    let offers = rawOffers.map(summarizeItinerary);
    if (nonStop === "true") {
      offers = offers.filter((o) => o.maxStops === 0);
    }

    if (offers.length === 0) {
      return res.json({ results: [], fastestHours: 0, cheapestPrice: 0, mock: useMock });
    }

    const fastestHours = Math.min(...offers.map((o) => o.totalHours));
    const cheapestPrice = Math.min(...offers.map((o) => o.price));
    const hourlyRate = parseFloat(hourlyValue) || 0;

    const results = offers
      .map((o) => {
        const extraHours = Math.round((o.totalHours - fastestHours) * 100) / 100;
        const extraCostVsCheapest =
          Math.round((o.price - cheapestPrice) * 100) / 100;
        const effectiveCost =
          Math.round((o.price + o.totalHours * hourlyRate) * 100) / 100;
        return { ...o, extraHours, extraCostVsCheapest, effectiveCost };
      })
      .sort((a, b) => a.effectiveCost - b.effectiveCost);

    res.json({ results, fastestHours, cheapestPrice, hourlyRate, mock: useMock });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Flight Finder running at http://localhost:${PORT}`);
});
