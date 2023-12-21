import React, {Component} from "react";
import {connect} from "react-redux";
import {withNamespaces} from "react-i18next";
import {Intent, Spinner} from "@blueprintjs/core";
import {Link} from "react-router";

import "./Loading.css";

/**
  This component is displayed when the needs of another component are being
  loaded into the redux store.
*/
class Loading extends Component {
  render() {
    const {progress, t, total} = this.props;
    return <div className="loading">
      <div className="loading-wrapper">
        <div className="brand">
          <Link to="/">
            <img src={"/icons/homepage/svg/logo-dmx-vertical.svg"} alt="" />
          </Link>
        </div>
        {/* <div className="progress-bar">
          <ProgressBar value={progress / total} />
        </div> */}

        {/* <div>{t("Loading.description", {progress, total})}</div> */}
        <div className="loading-spinner">
          <Spinner size={Spinner.SIZE_STANDARD} value={null} />
        </div>
        <div className="collaborator-icons">
          <div>
            <span className="text">{t("Built and Developed by")}</span>
          </div>
          <div className="content">
            <a href="https://www.gob.mx/se/" target="_blank" rel="noopener noreferrer">
              <img className="mini-icon se" src="/icons/SE.png" alt="" />
            </a>
            <a href="https://datawheel.us" target="_blank" rel="noopener noreferrer">
              <img className="mini-icon" src="/icons/datawheel-white.svg" alt="" />
            </a>
          </div>
        </div>
      </div>

      {/* <div className="brand">
        <span className="text">{t("Built and Developed by")}</span>
        <a rel="noopener noreferrer" target="_blank" href="http://datawheel.us">
          <img src="/icons/datawheel-white.svg" />{" "}
        </a>
      </div> */}
    </div>;
  }
}

export default withNamespaces()(connect(
  (state, ownProps) => "total" in ownProps ? {
    total: ownProps.total,
    progress: ownProps.progress
  } : {
    total: state.loadingProgress.requests,
    progress: state.loadingProgress.fulfilled
  }
)(Loading));
