"use strict";

/* script setup:
        1. Create references to (and instantiations for when necessary) AiM library features we'll need later.
           Mostly boiler-plate.
        2. Get parameters from ae_

 */

//
//const MODULE_PATH = com.maximus.fmax.common.framework.dao.ScriptRunner.getInstance().getModulePath(null);
const MODULE_PATH = standardModulePath;
//Bootstrap Require
bootStrapRequire();
const APP_CONTEXT = com.maximus.fmax.common.framework.util.Application.getInstance().getContext();
const CONFIGURATION = require(MODULE_PATH + "action-code-configuration_1.0");
const CONFIG_INSTANCE = CONFIGURATION.createTriggeredInstance(actionCodeDocument);
const DEBUG = CONFIG_INSTANCE.get("DEBUG", true); //Advanced Script Parameter

//hook up the logger
//const prettyErrors = require(MODULE_PATH + "pretty-errors_1.0"); use this instead???
const ACTION_CODE_TITLE = "ACTION CODE ENFORCE PHASE COMPLETE RULES";
const VERSION = "1.0";
const LOG_MSG_PREFIX = ACTION_CODE_TITLE + " " + VERSION + " ";
const LOG_MESSAGE = require(MODULE_PATH + "log-message_1.0");
LOG_MESSAGE.init(LOG_MSG_PREFIX, DEBUG);
var logRecords = [];

//Objects for Business Rules
const PHASE_COMPLETE = "PHASE COMPLETE";
const SHOP_DONE = "SHOP DONE";
var assetMgtFacade = new com.maximus.fmax.assetmgt.AssetMgtFacade(APP_CONTEXT);

log("STARTING");
//if the business rules fail to hold, bail out and return all errors to the user
var success = false;
try {
    success = runScript();
}
catch (e) {
    log("Error running script logic: \n" + e.toString());
}
finally  {
writeToBatchEvent();
}
if(!success){
    false; //never put anything after this *ever*
}
else {
    log("STOPPING - COMPLETED WITHOUT FATAL ERRORS");
}

function runScript() {
    // Need to clear any potentially lingering errors on the screen or a previous warning could still be there
    // and the user will get stuck on a modal dialogue
    var phase = newDocument;
    phase.clearErrors();
    let proposal = phase.getProposal();
    let sortCode = phase.getSortCode();
    let phsStrForLog = proposal + "-" + sortCode;
    let phaseStatus = phase.getStatusCode();
    log("Processing " + phsStrForLog + " moving to Status: " + phaseStatus);
    if(phaseStatus != PHASE_COMPLETE && phaseStatus != SHOP_DONE) {
        logIfDebug("Phase processed - nothing to do.");
    }
    else {
        logIfDebug("Phase's status is marked as 'complete' - let's ensure its inspection is closed.")
        let inspectionDTO = new com.maximus.fmax.assetmgt.dto.AeAmInspectionEDTO();
        inspectionDTO.setProposal(proposal);
        inspectionDTO.setSortCode(sortCode);
        let inspections = assetMgtFacade.findByDTO(inspectionDTO, null);
        for(let inspection of inspections) {
            let inspectionStatus = inspection.getStatusCode();
            if(inspectionStatus == "OPEN" || inspectionStatus == "PENDING") {
                logIfDebug("ERROR: This Phase's inspection, " + inspection.getInspectionNo() + ", is not CLOSED.");
                let errorText = ["You must submit this Phase's inspection before changing the status to " + inspectionStatus]
                let errorMessage = new com.maximus.fmax.common.framework.util.ErrorMessage(
                    com.maximus.fmax.workmgt.util.AePPhsEAttributeName.STATUS_CODE,
                    com.maximus.fmax.common.framework.util.ErrorCode.SCRIPT_ERROR,
                    com.maximus.fmax.common.framework.util.ErrorType.HARD,
                    errorText);
                newDocument.addError(errorMessage);
                return false;
            }
        }
        logIfDebug("Phase processed - satisfied all business requirements.")
    }
    return true;
}

//shortcut functions
function log(message) {
    LOG_MESSAGE.getInstance().logMessage(message);
    logRecords.push(message);
}
function logIfDebug(message) {
    if(DEBUG) {
        log(message);
    }
}

function writeToBatchEvent(success=true) {
    const logger = require(MODULE_PATH + "write-ae_event_log_1.0");
    var woPhaseString = newDocument.getProposal() + "-" + newDocument.getSortCode();
    logger.init("Enforce Phase Complete Rules [" + woPhaseString + "]");
    logRecords.forEach(function (logMsg) {
        LOG_MESSAGE.getInstance().logMessage("Inside LogMsg: " + logMsg); //mgracz for metadebugging
        logger.getInstance().writeLog(new logger.LogRecord("E", null, logMsg));
    });
    return success
}


///////////////////////////////BOOTSTRAP/////////////////////
/**
 * If require() is not available, attempt to load it from jvm-npm.js
 * @throws TypeError: Cannot load script from jvm-npm.js
 */
function bootStrapRequire() {
    if (typeof require != "function" && typeof load == "function") {
        load(MODULE_PATH + "jvm-npm_1.0.js");
    }
}
////////////////////////////////////////////END OF BOOTSTRAP
