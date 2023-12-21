import React from "react";
import HelmetWrapper from "../HelmetWrapper";
import ReactTable from "react-table";
import axios from "axios";
import {Geomap, Plot, Treemap} from "d3plus-react";
import {Switch, Slider, InputGroup, Button, Label} from "@blueprintjs/core";
import {formatAbbreviate} from "d3plus-format";
import {saveAs} from "file-saver";
import {strip} from "d3plus-text";
import {withNamespaces} from "react-i18next";
import {connect} from "react-redux";

import DMXButtonGroup from "../../components/DMXButtonGroup";
import DMXSelect from "../../components/DMXSelect";
import DMXTree from "../../components/DMXTree";
import Footer from "../../components/Footer";
import Loading from "../../components/Loading";
import LoadingChart from "../../components/LoadingChart";
import Nav from "../../components/Nav";

import {cubes} from "helpers/complexity";

import "react-table/react-table.css";
import "./ECIExplorer.css";

/** */
export function parseURL(query) {
  return Object.entries(query)
    .map(([key, val]) => `${key}=${val}`)
    .join("&");
}

const filename = str => strip(str.replace(/<[^>]+>/g, ""))
  .replace(/^\-/g, "")
  .replace(/\-$/g, "");

const geoLevels = (baseUrl, lng = "en", dataset = "inegi_economic_census") => {
  let output = [
    {
      id: "State",
      name: lng === "en" ? "State" : "Entidad Federativa",
      topojson: `${baseUrl}/topojson/Entities.json`,
      topojsonId: d => d.properties.ent_id,
      tiles: false
    }
  ];
  if (["inegi_economic_census", "inegi_denue", "economy_foreign_trade_mun"].includes(dataset)) {
    output = output.concat([
      {
        id: "Metro Area",
        name: lng === "en" ? "Metropolitan Area" : "Zona Metropolitana",
        topojson: `${baseUrl}/topojson/MetroAreas.json`,
        topojsonId: d => d.properties.zm_id,
        tiles: true
      },
      {
        id: "Municipality",
        name: lng === "en" ? "Municipality" : "Municipio",
        topojson: `${baseUrl}/topojson/Municipalities.json`,
        topojsonId: d => d.properties.mun_id,
        tiles: false
      }
    ]);
  }
  if (["inegi_enoe"].includes(dataset)) {
    output = output.concat([
      {
        id: "Self Represented City",
        name: lng === "en" ? "Self Represented City" : "Ciudad Auto Representada",
        topojson: `${baseUrl}/topojson/SelfCities.json`,
        topojsonId: d => d.properties.self_city_id,
        tiles: false
      }
    ]);
  }
  return output;
};

const cubeItems = Object.keys(cubes).map(d => {
  const obj = cubes[d];
  return {id: obj.cube, name: obj.name};
});

class ECIExplorer extends React.Component {
  constructor(props) {
    super(props);

    const {baseUrl} = props;

    // Selects default params used on the site
    const cubeId = "inegi_denue";
    const cubeItem = cubeItems.find(d => d.id === cubeId);
    const cubeSelected = cubes[cubeId];

    const tempState = {
      cubeItem,
      cubeSelected,
      geoSelected: geoLevels(baseUrl, props.lng, cubeId)[0],
      isAgg: cubeSelected.isAgg,
      measureSelected: cubeSelected.measures[1],
      timeSelected: cubeSelected.time[0],
      levelSelected: cubeSelected.levels[0]
    };

    const newTempState = Object.entries(tempState).reduce((obj, d) => {
      obj[`${d[0]}Temp`] = d[1];
      return obj;
    }, {});

    this.state = {
      ECIApi: undefined,
      PCIApi: undefined,
      data: [],
      dataPCI: [],
      dataRCA: [],
      loading: true,
      thresholdGeo: 300,
      thresholdIndustry: 300,
      ...tempState,
      ...newTempState,
      availableIndustryProfiles: []
    };
  }

  handleCopyClipboard = text => {
    // this.setState({[key]: true});
    navigator.clipboard.writeText(text);
  }

  onCSV = (data, title) => {
    const rowDelim = "\r\n";
    const colDelim = ",";

    const columns = data && data[0] ? Object.keys(data[0]) : [];
    let csv = columns.map(val => `\"${val}\"`).join(colDelim);

    for (let i = 0; i < data.length; i++) {
      const results = data[i];
      csv += rowDelim;
      csv += columns.map(key => {
        const val = results[key];
        return typeof val === "number" ? val
          : val ? `\"${val}\"` : "";
      }).join(colDelim);
    }

    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    saveAs(blob, `${filename(title)}.csv`);
  }

  getChangeHandler = key => value => this.setState({[key]: value});

  componentDidMount() {
    this.fetchData();
  }

  fetchData = () => {
    this.setState({data: [], loading: true});
    const {cubeSelectedTemp, isAggTemp, levelSelectedTemp, geoSelectedTemp, measureSelectedTemp, thresholdGeo, thresholdIndustry, timeSelectedTemp} = this.state;

    const time = timeSelectedTemp.id;
    const timeIndex = cubeSelectedTemp.time.findIndex(d => d.id === time);

    const agg = isAggTemp ? 3 : 1;
    const timeList = cubeSelectedTemp.time.slice(timeIndex, timeIndex + agg).map(d => d.id);
    const n = timeList.length;
    const timeIds = timeList.join();
    const timeDrilldown = cubeSelectedTemp.timeDrilldown;

    const industryLevel = levelSelectedTemp.id;
    const geoLevel = geoSelectedTemp.id;
    const measure = measureSelectedTemp.id;
    const geoThreshold = thresholdGeo * n;
    const industryThreshold = thresholdIndustry * n;

    let params = {
      cube: cubeSelectedTemp.cube,
      [timeDrilldown]: timeIds,
      rca: [geoLevel, industryLevel, measure].join(),
      threshold: [`${industryLevel}:${industryThreshold}`, `${geoLevel}:${geoThreshold}`].join(),
      debug: true,
      locale: this.props.lng
    };

    // Foreign Trade Data
    if (cubeSelectedTemp.cube === "economy_foreign_trade_mun") {
      const isMun = ["Municipality", "Metro Area"].includes(geoLevel);
      const geoLevelsCut = {
        "Metro Area": 2,
        "Municipality": 2,
        "State": 1
      };
      const customCubeParams = {
        "cube": `economy_foreign_trade_${isMun ? "mun" : "ent"}`,
        "Product Level": industryLevel === "HS6" ? 6 : 4,
        "Level": geoLevelsCut[geoLevel],
        "Flow": 2
      };

      const rightParams = {
        cubeRight: "trade_i_baci_a_12",
        rcaRight: `Exporter Country,${levelSelectedTemp.name},Trade Value`,
        YearRight: timeIds,
        method: "subnational",
        aliasRight: `Country,${levelSelectedTemp.name}`
      };
      params = Object.assign(params, customCubeParams, rightParams);
    }

    const origin = "https://www.economia.gob.mx/datamexico";// window.location.origin;
    const ECIApiBase = "/api/stats/eci";
    const PCIApiBase = "/api/stats/pci";
    const apiBase = "https://www.economia.gob.mx/datamexico/api";

    const ECIApi = `${origin}${ECIApiBase}?${parseURL(params)}`;
    const PCIApi = `${origin}${PCIApiBase}?${parseURL(params)}`;
    const availableIndustries = `${apiBase}/tesseract/data.jsonrecords?cube=inegi_economic_census&drilldowns=Industry+Group&measures=Economic+Unit&parents=false&sparse=false`;

    axios.all([
      axios.get(ECIApiBase, {params}),
      axios.get(PCIApiBase, {params}),
      axios.get(availableIndustries)
    ]).then(axios.spread((...resp) => {
      const data = resp[0].data.data;
      const dataPCI = resp[1].data.data;
      const availableIndustryProfiles = [...new Set(resp[2].data.data.map(m => m["Industry Group ID"]))];
      // this.fetchRCAData();
      this.setState({
        data,
        dataPCI,
        ECIApi,
        PCIApi,
        loading: false,
        cubeSelected: cubeSelectedTemp,
        geoSelected: geoSelectedTemp,
        isAgg: isAggTemp,
        timeSelected: timeSelectedTemp,
        levelSelected: levelSelectedTemp,
        measureSelected: measureSelectedTemp,
        availableIndustryProfiles
      });
    }));
  }

  // fetchRCAData = (geoId = 1, level = undefined) => {
  //   const year = 2019;
  //   const yearList = [year];
  //   const years = yearList.join();
  //   const {geoSelectedTemp, measureSelectedTemp, thresholdGeo, thresholdIndustry} = this.state;

  //   const industryLevel = "Industry Group"; // "Industry Group", "NAICS Industry", "National Industry"
  //   const geoLevel = level || geoSelectedTemp.id; // "State", "Municipality", "Metro Area"
  //   const measure = measureSelectedTemp.id; // "Number of Employees Midpoint", "Number of Employees LCI", "Number of Employees UCI", "Companies"
  //   const geoThreshold = thresholdGeo;
  //   const industryThreshold = thresholdIndustry;

  //   const params = {
  //     cube: "inegi_denue",
  //     Year: years,
  //     rca: [geoLevel, industryLevel, measure].join(),
  //     threshold: [`${industryLevel}:${industryThreshold}`, `${geoLevel}:${geoThreshold}`].join(),
  //     parents: true,
  //     [`filter_${geoLevel}`]: geoId,
  //     locale: this.props.lng
  //   };
  //   axios.get("/api/stats/rca", {params}).then(resp => {
  //     const dataRCA = resp.data.data;
  //     this.setState({dataRCA});
  //   });
  // }

  render() {
    const {
      availableIndustryProfiles,
      cubeSelected,
      data,
      dataPCI,
      dataRCA,
      loading,
      geoSelectedTemp,
      geoSelected,
      measureSelected,
      measureSelectedTemp,
      levelSelectedTemp,
      levelSelected,
      timeSelectedTemp,
      timeSelected
    } = this.state;

    const {baseUrl, lng, t, route, routeParams} = this.props;

    const eciMeasure = `${measureSelected.id} ECI`;
    const pciMeasure = `${measureSelected.id} PCI`;
    const rcaMeasure = `${measureSelected.id} RCA`;
    const geoId = `${geoSelected.id} ID`;
    const geoName = geoSelected.id;
    const industryId = `${levelSelected.id} ID`;

    const columns = [
      {id: geoId, accessor: geoId, Header: `${t(geoSelected.id)} ID`},
      {id: geoName, accessor: d => <a href={`/${lng}/profile/geo/${d[geoId]}`}>{d[geoName]}</a>, Header: t(geoName)},
      {id: eciMeasure, accessor: eciMeasure, Header: "ECI", Cell: d => formatAbbreviate(d.original[`${measureSelected.id} ECI`])}
    ];
    const columnsPCI = [
      {id: industryId, accessor: industryId, Header: `${t(levelSelected.name)} ID`},
      {
        id: levelSelected.id,
        accessor: d => industryId !== "Industry Group ID" ? d[levelSelected.name] : availableIndustryProfiles.includes(d[industryId]) ? <a href={`/${lng}/profile/industry/${d[industryId]}`}>{d[levelSelected.name]}</a> : d[levelSelected.name],
        Header: t(levelSelected.name)
      },
      {id: pciMeasure, accessor: pciMeasure, Header: "PCI", Cell: d => formatAbbreviate(d.original[`${measureSelected.id} PCI`])}
    ];

    // const dataScatter = dataPCI.map(d => {
    //   const item = dataRCA.find(h => h[industryId] === d[industryId]) || {};
    //   return {...d, ...item};
    // }).filter(d => d[rcaMeasure] && d[pciMeasure]);

    // const pciValues = dataScatter.map(d => d[pciMeasure]);
    // const rcaValues = dataScatter.map(d => d[rcaMeasure]);
    // const maxPCI = Math.max(...pciValues),
    //       maxRCA = Math.max(...rcaValues),
    //       minPCI = Math.min(...pciValues);

    const share = {
      title: `${t("ECI Explorer.Title")}`,
      desc: t("Share.ECI Explorer")
    };

    return <div>
      <HelmetWrapper info={share} />
      <Nav
        className={"background"}
        logo={false}
        routePath={route.path}
        routeParams={routeParams}
        title={""}
      />
      <div className="container eci-container">
        <div className="columns eci-panel">
          <div className="column is-300">
            <h1 className="title">{t("ECI Explorer.Title")}</h1>
            {/* <p className="eci-explore">
              {t("ECI Explorer.Description")}
            </p> */}

            <DMXButtonGroup
              items={geoLevels(baseUrl, lng, this.state.cubeItemTemp.id)}
              selected={geoSelectedTemp}
              title={t("Geographic Level")}
              callback={geoSelectedTemp => this.setState({geoSelectedTemp})}
            />
            <DMXButtonGroup
              items={this.state.cubeSelectedTemp.levels}
              selected={levelSelectedTemp}
              callback={levelSelectedTemp => this.setState({levelSelectedTemp})}
              title={t("Industry Level")}
            />
            <DMXSelect
              callback={measureSelectedTemp => this.setState({measureSelectedTemp})}
              items={this.state.cubeSelectedTemp.measures}
              selectedItem={measureSelectedTemp}
              title={t("Measure")}
            />
            <DMXSelect
              items={this.state.cubeSelectedTemp.time}
              selectedItem={timeSelectedTemp}
              callback={timeSelectedTemp => this.setState({timeSelectedTemp})}
              title={t("Time")}
            />

            <DMXTree t={t}>
              <DMXSelect
                callback={cubeItemTemp => {
                  const cubeId = cubeItemTemp.id;
                  const cubeSelectedTemp = cubes[cubeId];
                  this.setState({
                    cubeItemTemp,
                    cubeSelectedTemp,
                    geoSelectedTemp: geoLevels(baseUrl, this.props.lng, cubeId)[0],
                    isAggTemp: cubeSelectedTemp.isAgg,
                    levelSelectedTemp: cubeSelectedTemp.levels[0],
                    measureSelectedTemp: cubeSelectedTemp.measures[0],
                    timeSelectedTemp: cubeSelectedTemp.time[0]
                  });
                }}
                items={cubeItems}
                selectedItem={this.state.cubeItemTemp}
                title={t("Dataset")}
              />

              <div className="dmx-slider">
                <h4 className="title" dangerouslySetInnerHTML={{
                  __html: t("ECI Explorer.Threshold", {
                    level: t(geoSelectedTemp.name),
                    measure: t(measureSelectedTemp.title)
                  })
                }} />

                <Slider
                  min={100}
                  max={1000}
                  stepSize={10}
                  labelStepSize={100}
                  onChange={this.getChangeHandler("thresholdGeo")}
                  value={this.state.thresholdGeo}
                />
              </div>

              <div className="dmx-slider">
                <h4 className="title" dangerouslySetInnerHTML={{
                  __html: t("ECI Explorer.Threshold", {
                    level: t(levelSelectedTemp.name),
                    measure: t(measureSelectedTemp.title)
                  })
                }} />
                <Slider
                  min={100}
                  max={1000}
                  stepSize={10}
                  labelStepSize={100}
                  onChange={this.getChangeHandler("thresholdIndustry")}
                  value={this.state.thresholdIndustry}
                />
              </div>

              <Switch
                checked={this.state.isAggTemp}
                label={t("Values aggregated")}
                onChange={() => this.setState({isAggTemp: !this.state.isAggTemp})}
              />
            </DMXTree>
            <button
              onClick={() => this.fetchData()}
              className="dmx-button"
            >
              {t("ECI Explorer.Build ECI / PCI")}
            </button>
          </div>
          <div className="column">
            {!loading ? <div className="eci-geo-viz">
              <h2 className="title">
                {t("ECI Explorer.Graphic Title", {
                  time: timeSelected.name
                })}
              </h2>
              <h4 className="subtitle">
                {t("ECI Explorer.Graphic Subtitle", {
                  cube: t(cubeSelected.name),
                  geo: t(geoSelected.name),
                  level: t(levelSelected.name)
                })}
              </h4>
              <Geomap
                config={{
                  data,
                  groupBy: [geoId],
                  colorScale: eciMeasure,
                  colorScaleConfig: {
                    color: ["#ffffe0", "#a5d5d8", "#73a2c6", "#4771b2", "#00429d"],
                    midpoint: 0,
                    scale: "linear"
                  },
                  tooltipConfig: {
                    tbody: d => [
                      ["ECI", formatAbbreviate(d[eciMeasure])]
                    ]
                  },
                  tiles: true,
                  topojson: geoSelected.topojson,
                  topojsonId: geoSelected.topojsonId
                }}
              />
            </div> : <LoadingChart message={t("Loading visualization")} />}
          </div>
        </div>

        {/* Table section */}
        <div className="columns eci-tables">
          <div className="column eci-table">
            <div className="eci-description">
              <h2 className="eci-description-title">{t("ECI Explorer.ECI Title")}</h2>
              <p className="eci-description-text">{t("ECI Explorer.ECI Subtitle")}</p>
            </div>
            {!loading ? <div>
              <Label>API
                <InputGroup
                  rightElement={<Button>{t("Copy")}</Button>}
                  value={this.state.ECIApi}
                  onClick={() => this.handleCopyClipboard(this.state.ECIApi)}
                />
              </Label>
              <ReactTable
                data={data}
                columns={columns}
                showPagination={false}
                defaultPageSize={data.length}
                minRows={1}
                resizable={false}
                defaultSorted={[{id: eciMeasure, desc: true}]}
                defaultSortDesc={true}
              />
              <button
                className="dmx-button"
                onClick={() => this.onCSV(data, "ECI")}
              >
                {t("ECI Explorer.Download ECI dataset")}
              </button>
            </div> : <LoadingChart message={t("Loading visualization")} />}
          </div>
          <div className="column eci-table">
            <div className="eci-description">
              <h2 className="eci-description-title">{t("ECI Explorer.PCI Title")}</h2>
              <p className="eci-description-text">{t("ECI Explorer.PCI Subtitle")}</p>
            </div>
            {!loading ? <div>
              <Label>API
                <InputGroup
                  rightElement={<Button>{t("Copy")}</Button>}
                  value={this.state.PCIApi}
                  onClick={() => this.handleCopyClipboard(this.state.PCIApi)}
                />
              </Label>
              <ReactTable
                data={this.state.dataPCI}
                columns={columnsPCI}
                showPagination={false}
                defaultPageSize={this.state.dataPCI.length}
                minRows={1}
                resizable={false}
                defaultSorted={[{id: pciMeasure, desc: true}]}
                defaultSortDesc={true}
              />
              <button
                onClick={() => this.onCSV(this.state.dataPCI, "PCI")}
                className="dmx-button"
              >
                {t("ECI Explorer.Download PCI dataset")}
              </button>
            </div> : <LoadingChart message={t("Loading visualization")} />}
          </div>
        </div>

      </div> {/** End of .eci-container */}
      <Footer />
    </div>;
  }
}

export default withNamespaces()(
  connect(state => ({
    baseUrl: state.env.CANON_API
  }))(ECIExplorer)
);
