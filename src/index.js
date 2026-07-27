import Perlin from './perlin.js';
import { Timeseries, SLIWindow } from './timeseries.js';

export default class AlertView {
    constructor(elem, totalSeconds, sampleRateSeconds) {
        this.elem = elem;
        this.totalSeconds = totalSeconds;
        this.sampleRateSeconds = sampleRateSeconds;
    }

    renderWithHydratedConfig(config){
        const sloTargetFraction = config.slo.targetPercent / 100;
        const errorBudgetFraction = 1 - sloTargetFraction;
        const burnRateThreshold = config.slo.burnRateThreshold;

        const maxErrorRate = config.data.bad.maxErrorPercent / 100;

        var timeline = [];
        var t = new Date();
        t.setHours(0, 0, 0, 0);

        var cumulative = new SLIWindow(
            this.totalSeconds / this.sampleRateSeconds,
        );
        var longWindow = new SLIWindow(
            config.slo.longWindowSeconds / this.sampleRateSeconds,
        );
        var shortWindow = new SLIWindow(
            config.slo.shortWindowSeconds / this.sampleRateSeconds,
        );

        const perlin = new Perlin(3);

        for (
            var i = 0;
            i < this.totalSeconds;
            i += this.sampleRateSeconds
        ) {
            t.setSeconds(t.getSeconds() + this.sampleRateSeconds);
            // TODO: Add noise and a daily cycle
            const amplitude = 100000;
            var good = amplitude;

            var errorRate = perlin.getValue(
                (256 / 2) * (i / this.totalSeconds),
            );

            // Errors can only be above 0
            if (errorRate < 0) {
                errorRate = 0;
            }
            // Limit error duration
            if (
                i < this.totalSeconds / 4 ||
                i > this.totalSeconds / 4 + 3 * 60 * 60
            ) {
                errorRate = 0;
            }
            // Scale maximum error percentage
            errorRate *= maxErrorRate;

            cumulative.push(good, good * errorRate);
            longWindow.push(good, good * errorRate);
            shortWindow.push(good, good * errorRate);

            timeline.push({
                time: t.toISOString(),
                good: good,
                bad: good * errorRate,
                cumulative: cumulative.clone(),
                longWindow: longWindow.clone(),
                shortWindow: shortWindow.clone(),
            });
        }

        var dataGraph = new Timeseries(
            this.totalSeconds,
            this.sampleRateSeconds,
            {
                type: "scatter",
            },
        );
        if (config.traces.good) {
          dataGraph.addTrace((i) => timeline[i].good, { name: "good" });
        }
        if (config.traces.bad) {
          dataGraph.addTrace((i) => timeline[i].bad, { name: "bad" });
        }
        if (config.traces.cumulativeErrors) {
          dataGraph.addTrace(
            (i) => 1 - timeline[i].cumulative.errorRate(),
            { name: "cumulative" },
          );
        }
        if (config.traces.cumulativeLong) {
          dataGraph.addTrace(
              (i) => 1 - timeline[i].longWindow.errorRate(),
              { name: "long window" },
          );
        }
        if (config.traces.cumulativeShort) {
          dataGraph.addTrace(
              (i) => 1 - timeline[i].shortWindow.errorRate(),
              { name: "short window" },
          );
        }
        if (config.traces.burnLong) {
          dataGraph.addThreshold(burnRateThreshold);
          dataGraph.addTrace(
              (i) =>
                  timeline[i].longWindow.errorRate() /
                  errorBudgetFraction,
              { name: "long window" },
          );
        }
        if (config.traces.burnShort) {
          dataGraph.addTrace(
              (i) =>
                  timeline[i].shortWindow.errorRate() /
                  errorBudgetFraction,
              { name: "short window" },
          );
        }

        dataGraph.addAlert((i) => {
            const l =
                timeline[i].longWindow.errorRate() /
                errorBudgetFraction;
            const s =
                timeline[i].shortWindow.errorRate() /
                errorBudgetFraction;
            return l > burnRateThreshold && s > burnRateThreshold;
        });
        dataGraph.render(this.elem);
    }

    // Fill out the config object, using values from Elements and calling functions.
    hydrateConfig(config) {
      function doHydrateConfig(obj) {
        var out = {}
        for (const [key, value] of Object.entries(obj)) {
          if (value instanceof Element) {
            out[key] = value.value;
          } else if (typeof value === 'function') {
            out[key] = value();
          } else if (typeof value === "object" && value !== null) {
            out[key] = doHydrateConfig(value);
          } else {
            out[key] = value;
          }
        }
        return out;
      }
      return doHydrateConfig(config);
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
