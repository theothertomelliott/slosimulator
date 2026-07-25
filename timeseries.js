class Timeseries {
  constructor(totalSeconds, sampleRateSeconds, defaultTraceSettings) {
    this.xAxis = [];
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    var j = 0;
    for (var i = 0; i < totalSeconds; i += sampleRateSeconds) {
      t.setSeconds(t.getSeconds() + sampleRateSeconds);
      this.xAxis.push(t.toISOString());
    }

    this.defaultTraceSettings = defaultTraceSettings;
    this.traces = [];
    this.alertFunctions = [];
  }

  addTrace(f, settings) {
    this.traces.push({
      f: f,
      settings: settings,
    });
  }

  addAlert(f) {
    this.alertFunctions.push(f);
  }

  buildData(f) {
    var out = {
      x: [],
      y: [],
    };
    for (var i = 0; i < this.xAxis.length; i++) {
      out.x.push(this.xAxis[i]);
      out.y.push(f(i));
    }
    return out;
  }

  buildAlertShapes(f) {
    var alerting = false;
    var alertStart = 0;
    var shapes = [];
    for (var x = 0; x < this.xAxis.length; x++) {
      var alertAtX = f(x);
      if (alertAtX && !alerting) {
        alerting = true;
        alertStart = x;
      }
      if (!alertAtX && alerting) {
        shapes.push({
          type: "rect",
          xref: "x", // Ties the X boundaries to data coordinates
          yref: "paper", // Sets Y boundaries to cover 100% height of the chart
          x0: this.xAxis[alertStart], // Shaded area starts at X = 2
          x1: this.xAxis[x], // Shaded area ends at X = 4
          y0: 0, // Bottom edge of the chart area
          y1: 1, // Top edge of the chart area
          fillcolor: "#ff0000", // Background fill color
          opacity: 0.3, // Keeps it semi-transparent so data shows through
          line: { width: 0 }, // Removes the border around the rectangle
        });
        alerting = false;
        alertStart = 0;
      }
    }

    if (alerting) {
      shapes.push({
        type: "rect",
        xref: "x", // Ties the X boundaries to data coordinates
        yref: "paper", // Sets Y boundaries to cover 100% height of the chart
        x0: this.xAxis[alertStart], // Shaded area starts at X = 2
        x1: this.xAxis[this.xAxis.length], // Shaded area ends at X = 4
        y0: 0, // Bottom edge of the chart area
        y1: 1, // Top edge of the chart area
        fillcolor: "#ff0000", // Background fill color
        opacity: 0.3, // Keeps it semi-transparent so data shows through
        line: { width: 0 }, // Removes the border around the rectangle
      });
    }
    return shapes;
  }

  render(divID, layout) {
    var data = [];
    for (const t of this.traces) {
      var td = this.buildData(t.f);
      for (const [key, value] of Object.entries(this.defaultTraceSettings)) {
        td[key] = value;
      }
      if (t.settings) {
        for (const [key, value] of Object.entries(t.settings)) {
          td[key] = value;
        }
      }
      data.push(td);
    }
    if (!layout) {
      layout = {};
    }
    if (!layout.shapes) {
      layout.shapes = [];
    }

    for (alert of this.alertFunctions) {
      layout.shapes = layout.shapes.concat(this.buildAlertShapes(alert));
    }

    Plotly.newPlot(divID, data, layout);
  }
}

class SLIWindow {
  constructor(maxValues) {
    this.good = [];
    this.bad = [];
    this.maxValues = maxValues;
  }

  clone() {
    var out = new SLIWindow(this.maxValues);
    for (var g of this.good) {
      out.good.push(g);
    }
    for (var b of this.bad) {
      out.bad.push(b);
    }
    return out;
  }

  push(good, bad) {
    this.good.push(good);
    this.bad.push(bad);

    if (this.good.length > this.maxValues) {
      this.good = this.good.slice(1);
    }
    if (this.bad.length > this.maxValues) {
      this.bad = this.bad.slice(1);
    }
  }

  sum() {
    var out = {
      good: 0,
      bad: 0,
    };

    for (var v of this.good) {
      out.good += v;
    }
    for (var v of this.bad) {
      out.bad += v;
    }

    return out;
  }

  errorRate() {
    const s = this.sum();
    return s.bad / (s.good + s.bad);
  }
}
