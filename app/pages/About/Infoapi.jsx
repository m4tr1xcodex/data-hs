import React, {Component} from "react";
import PropTypes from "prop-types";
import {withNamespaces} from "react-i18next";

import "./About.css";

class Infoapi extends Component {
  render() {
    const {t, infoapi} = this.props;

    return (
      <div className="about-infoapi">
        <h3>{t("About.Access to data")}</h3>
        <p>{t("About.IntroAPI1")} <a href="https://datamexico.org/es/vizbuilder" target="_blank" rel="noopener noreferrer">vizbuilder</a></p>
        <p>{t("About.IntroAPI2")} </p>

        {infoapi.length > 0 && infoapi.map(d =>
          <div className="press-news">
            <p>{d.Text}</p>
            <ul>
              <li><a href={d.Link} target="_blank" rel="noopener noreferrer">{d.Concept}</a></li>
              <p>{d.Description}</p>
            </ul>
          </div>
        )}
      </div>
    );
  }
}

Infoapi.contextTypes = {
  router: PropTypes.object
};

export default withNamespaces()(Infoapi);
