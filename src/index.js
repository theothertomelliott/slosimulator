import Perlin from "./perlin.js";
import createGaussianSmootherWithSeed from "./gaussian.js";
import { Timeseries, SLIWindow } from "./timeseries.js";

const USE_PERLIN = false;

// Settings
// max gap between bursts of Errors
// max duration of error bursts
// need to determine current state, then look backwards
// look back over that number of previous points. see if you need to change the state.
// window of errors
function errorAtGen() {
  var memory = [];
  function errorAt(i) {}
}

function getErrorGenerator(seed) {
  const perlin = new Perlin(seed);
  const gauss = createGaussianSmootherWithSeed(seed, -2.5);

  function perlinGen(i) {
    return perlin.getValue(
      // TODO: Figure out a better scaling factor
      256 * i,
    );
  }

  function gaussianGen(i) {
    return gauss(i);
  }

  function combo(i) {
    return (gaussianGen(i) + perlinGen(i)) / 2;
  }

  if (USE_PERLIN) {
    return perlinGen;
  }
  if (true) {
    return combo;
  }
  return gaussianGen;
}

export default class AlertView {
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
      const good = config.data.good(i);
      const bad = config.data.bad(i);

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
      if (!out.data.good || typeof out.data.good !== "function") {
        out.data.good = (i) => {
          // TODO: Add noise and a daily cycle
          const amplitude = 100000;
          return amplitude;
        };
      }
      if (!out.data.bad) {
        out.data.bad = (i) => {
          return 0;
        }
      } else if (typeof out.data.bad !== "function") {
        const errGen = getErrorGenerator(1);
        const maxErrorRate = config.data.bad.maxErrorPercent / 100;
        out.data.bad = (i) => {
          var errorRate = errGen(i / totalSeconds);

          // Errors can only be above 0
          if (errorRate < 0) {
            errorRate = 0;
          }
          // Limit error duration
          if (
            i < totalSeconds / 4 ||
            i > totalSeconds / 4 + 3 * 60 * 60
          ) {
            errorRate = 0;
          }
          // Scale maximum error percentage
          errorRate *= maxErrorRate;
          return out.data.good(i) * errorRate;
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
