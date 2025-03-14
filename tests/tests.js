const expect = chai.expect;

describe('fillMissingYears', function() {
  it('should fill missing years with null values', function() {
    const input = [
      { year: 2000, value: 10 },
      { year: 2002, value: 20 }
    ];
    const result = fillMissingYears(input, 2000, 2003);
    expect(result).to.deep.equal([
      { year: 2000, value: 10 },
      { year: 2001, value: null },
      { year: 2002, value: 20 },
      { year: 2003, value: null }
    ]);
  });
});

describe('processWeatherData', function() {
  it('should process weather data and calculate annual averages', function() {
    const data = [
      { DATE: '20000115', ELEMENT: 'TMIN', VALUE: '50' },  // 50/10 = 5
      { DATE: '20000115', ELEMENT: 'TMAX', VALUE: '150' }, // 150/10 = 15
      { DATE: '20010115', ELEMENT: 'TMIN', VALUE: '60' }    // 60/10 = 6
    ];
    const result = processWeatherData(data);
    expect(result).to.deep.equal({
      annualTmin: [
        { year: 2000, value: 5 },
        { year: 2001, value: 6 }
      ],
      annualTmax: [
        { year: 2000, value: 15 }
      ]
    });
  });
});