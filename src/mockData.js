// Sample data shaped like the real Sky-Scrapper (RapidAPI) itinerary format,
// so it flows through the same summarizeItinerary pipeline as live data.
// Used only when no RAPIDAPI_KEY is configured, or when ?demo=true is passed.

function leg(from, to, date, depTime, arrTime, durationMinutes, stopCount, segments) {
  return {
    origin: { id: from },
    destination: { id: to },
    departure: `${date}T${depTime}:00`,
    arrival: `${date}T${arrTime}:00`,
    durationInMinutes: durationMinutes,
    stopCount,
    segments,
  };
}

function seg(carrier, number, from, to, date, depTime, arrTime, durationMinutes) {
  return {
    origin: { flightPlaceId: from },
    destination: { flightPlaceId: to },
    departure: `${date}T${depTime}:00`,
    arrival: `${date}T${arrTime}:00`,
    durationInMinutes: durationMinutes,
    flightNumber: number,
    marketingCarrier: { alternateId: carrier },
  };
}

export function generateMockOffers({ origin, destination, departDate, returnDate }) {
  const hub = "SEA";

  const legs = (from, to, date, opts) => {
    if (opts.stops === 0) {
      return leg(from, to, date, opts.dep, opts.arr, opts.mins, 0, [
        seg(opts.carrier, opts.flightNum, from, to, date, opts.dep, opts.arr, opts.mins),
      ]);
    }
    // 1-stop via hub
    const seg1Mins = Math.round(opts.mins * 0.25);
    const seg2Mins = opts.mins - seg1Mins - 90; // minus layover
    return leg(from, to, date, opts.dep, opts.arr, opts.mins, opts.stops, [
      seg(opts.carrier, opts.flightNum, from, hub, date, opts.dep, addMinutes(opts.dep, seg1Mins), seg1Mins),
      seg(opts.carrier2 || opts.carrier, opts.flightNum2 || opts.flightNum, hub, to, date, addMinutes(opts.dep, seg1Mins + 90), opts.arr, seg2Mins),
    ]);
  };

  function addMinutes(time, mins) {
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + mins;
    const hh = Math.floor((total / 60) % 24)
      .toString()
      .padStart(2, "0");
    const mm = (total % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const offers = [
    {
      price: { raw: 1240 },
      legs: [
        legs(origin, destination, departDate, {
          dep: "11:05",
          arr: "14:40",
          mins: 815,
          stops: 0,
          carrier: "DL",
          flightNum: "621",
        }),
        ...(returnDate
          ? [
              legs(destination, origin, returnDate, {
                dep: "16:20",
                arr: "13:55",
                mins: 815,
                stops: 0,
                carrier: "DL",
                flightNum: "622",
              }),
            ]
          : []),
      ],
    },
    {
      price: { raw: 905 },
      legs: [
        legs(origin, destination, departDate, {
          dep: "09:20",
          arr: "17:30",
          mins: 610,
          stops: 1,
          carrier: "UA",
          flightNum: "877",
          carrier2: "UA",
          flightNum2: "7861",
        }),
        ...(returnDate
          ? [
              legs(destination, origin, returnDate, {
                dep: "18:10",
                arr: "12:20",
                mins: 610,
                stops: 1,
                carrier: "UA",
                flightNum: "7862",
                carrier2: "UA",
                flightNum2: "878",
              }),
            ]
          : []),
      ],
    },
    {
      price: { raw: 512 },
      legs: [
        legs(origin, destination, departDate, {
          dep: "06:10",
          arr: "20:35",
          mins: 1105,
          stops: 2,
          carrier: "AA",
          flightNum: "1032",
          carrier2: "KE",
          flightNum2: "706",
        }),
        ...(returnDate
          ? [
              legs(destination, origin, returnDate, {
                dep: "07:45",
                arr: "22:50",
                mins: 1105,
                stops: 2,
                carrier: "KE",
                flightNum: "707",
                carrier2: "AA",
                flightNum2: "1033",
              }),
            ]
          : []),
      ],
    },
    {
      price: { raw: 840 },
      legs: [
        legs(origin, destination, departDate, {
          dep: "22:40",
          arr: "16:45",
          mins: 965,
          stops: 1,
          carrier: "AS",
          flightNum: "301",
          carrier2: "AS",
          flightNum2: "9921",
        }),
        ...(returnDate
          ? [
              legs(destination, origin, returnDate, {
                dep: "18:10",
                arr: "12:20",
                mins: 610,
                stops: 1,
                carrier: "AS",
                flightNum: "9922",
                carrier2: "AS",
                flightNum2: "302",
              }),
            ]
          : []),
      ],
    },
  ];

  return offers;
}
