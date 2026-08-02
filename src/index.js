import Perlin from "./perlin.js";
import seedrandom from "seedrandom";
import { createGaussianSmoother } from "./gaussian.js";
import { Timeseries, SLIWindow } from "./timeseries.js";

function Scale(scale, f) {
  return (i) => {
    return scale * f(i);
  };
}

function NormalWindow(start, duration, inside, outside) {
  function gaussianPDF(x, mean = 0, stdDev = 1) {
    return Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2)));
  }

  return (i) => {
    if (i >= start && i <= start + duration) {
      const gx = ((i - start) / duration) * 2 * 3.5 - 3.5;
      return gaussianPDF(gx) * inside(i);
    }
    return outside(i);
  };
}

function Window(start, duration, inside, outside) {
  return (i) => {
    if (i >= start && i <= start + duration) {
      return inside(i);
    }
    return outside(i);
  };
}

function OffsetY(offset, f) {
  return (i) => {
    return f(i) + offset;
  };
}

function DailyCycle() {
  return (i) => {
    const amplitude = 1 / 2;
    return amplitude + amplitude * Math.sin(i * 2 * Math.PI);
  };
}

function RandomNoise(seed, amplitude, f) {
  const rng = seedrandom(seed);
  return (i) => {
    var result = f(i);
    var n = amplitude * (rng(i) - 0.5);
    return result + n;
  };
}

function PerlinNoise(seed, amplitude, f) {
  const perlin = new Perlin(seed);
  return (i) => {
    var out = f(i);
    var noise = amplitude * (perlin.getValue((256 / 10) * i) - 0.5);
    return out + noise;
  };
}

function Gaussian(sigma, f) {
  const gauss = createGaussianSmoother(f, sigma);
  return gauss;
}

class AlertView {
  constructor(elem, totalSeconds, sampleRateSeconds) {
    this.elem = elem;
    this.totalSeconds = totalSeconds;
    this.sampleRateSeconds = sampleRateSeconds;
  }

  renderWithHydratedConfig(config) {
    const sloTargetFraction = config.slo.targetPercent / 100;
    const errorBudgetFraction = 1 - sloTargetFraction;
    const burnRateThreshold = config.slo.burnRateThreshold;

    var timeline = [];
    var t = new Date();
    t.setHours(0, 0, 0, 0);

    var cumulative = new SLIWindow(this.totalSeconds / this.sampleRateSeconds);
    var longWindow = new SLIWindow(
      config.slo.longWindowSeconds / this.sampleRateSeconds,
    );
    var shortWindow = new SLIWindow(
      config.slo.shortWindowSeconds / this.sampleRateSeconds,
    );

    for (var i = 0; i < this.totalSeconds; i += this.sampleRateSeconds) {
      t.setSeconds(t.getSeconds() + this.sampleRateSeconds);
      var good = config.data.good(i / this.totalSeconds);
      var bad = config.data.bad(i / this.totalSeconds);

      good = Math.round(Math.max(0, good));
      bad = Math.round(Math.max(0, bad));

      cumulative.push(good, bad);
      longWindow.push(good, bad);
      shortWindow.push(good, bad);

      timeline.push({
        time: t.toISOString(),
        good: good,
        bad: bad,
        cumulative: cumulative.clone(),
        longWindow: longWindow.clone(),
        shortWindow: shortWindow.clone(),
      });
    }

    var dataGraph = new Timeseries(this.totalSeconds, this.sampleRateSeconds, {
      type: "scatter",
    });
    if (config.traces.good) {
      dataGraph.addTrace((i) => timeline[i].good, { name: "good" });
    }
    if (config.traces.bad) {
      dataGraph.addTrace((i) => timeline[i].bad, { name: "bad" });
    }
    if (config.traces.cumulativeErrors) {
      dataGraph.addTrace((i) => 1 - timeline[i].cumulative.errorRate(), {
        name: "cumulative",
      });
    }
    if (config.traces.cumulativeLong) {
      dataGraph.addTrace((i) => 1 - timeline[i].longWindow.errorRate(), {
        name: "long window",
      });
    }
    if (config.traces.cumulativeShort) {
      dataGraph.addTrace((i) => 1 - timeline[i].shortWindow.errorRate(), {
        name: "short window",
      });
    }
    if (config.traces.burnLong) {
      dataGraph.addThreshold(burnRateThreshold);
      dataGraph.addTrace(
        (i) => timeline[i].longWindow.errorRate() / errorBudgetFraction,
        { name: "long window" },
      );
    }
    if (config.traces.burnShort) {
      dataGraph.addTrace(
        (i) => timeline[i].shortWindow.errorRate() / errorBudgetFraction,
        { name: "short window" },
      );
    }

    dataGraph.addAlert((i) => {
      const l = timeline[i].longWindow.errorRate() / errorBudgetFraction;
      const s = timeline[i].shortWindow.errorRate() / errorBudgetFraction;
      return l > burnRateThreshold && s > burnRateThreshold;
    });
    dataGraph.render(this.elem);
  }

  // Fill out the config object, using values from Elements and calling functions.
  hydrateConfig(config) {
    function doHydrateConfig(obj) {
      var out = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value instanceof Element) {
          out[key] = value.value;
        } else if (typeof value === "object" && value !== null) {
          out[key] = doHydrateConfig(value);
        } else {
          out[key] = value;
        }
      }
      return out;
    }

    const totalSeconds = this.totalSeconds;
    function processData(config) {
      var out = config;
      if (out.data.good && typeof out.data.good !== "function") {
        out.data.good = (i) => {
          return 0;
        };
      }
      if (!out.data.bad) {
        out.data.bad = (i) => {
          return 0;
        };
      } else if (typeof out.data.bad !== "function") {
        const errGen = getErrorGenerator(1);
        const maxErrorRate = config.data.bad.maxErrorPercent / 100;
        out.data.bad = (i) => {
          return 0;
        };
      }
      return out;
    }

    return processData(doHydrateConfig(config));
  }

  render(config) {
    // Set up listeners on elements
    var alertView = this;
    function watchConfig(obj) {
      for (const [key, value] of Object.entries(obj)) {
        if (value instanceof Element) {
          value.addEventListener("change", () => {
            alertView.renderWithHydratedConfig(alertView.hydrateConfig(config));
          });
          continue;
        }
        if (typeof value === "object" && value !== null) {
          watchConfig(value);
        }
      }
    }
    watchConfig(config);

    this.renderWithHydratedConfig(this.hydrateConfig(config));
  }
}

window.AlertView = AlertView;
window.DailyCycle = DailyCycle;
window.RandomNoise = RandomNoise;
window.PerlinNoise = PerlinNoise;
window.Gaussian = Gaussian;
window.OffsetY = OffsetY;
window.Scale = Scale;
window.Window = Window;
window.NormalWindow = NormalWindow;

export {
  AlertView,
  DailyCycle,
  RandomNoise,
  PerlinNoise,
  Gaussian,
  OffsetY,
  Scale,
  Window,
  NormalWindow,
};
