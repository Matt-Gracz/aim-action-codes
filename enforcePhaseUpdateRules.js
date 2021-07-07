"use strict";

//@author Matt Gracz
//@Creation 18 May 2021
//@Customer: University of Wisconsin
//Type: Triggered - before update 

/* Change Log*
**************************************************************************************************************
* 05/17/2021   Initial checkin.  Currently just prevents the user from making certain status changes to a Phase
               when (if it exists) the associated/child inspection is still open. -mgracz
* xx/xx/xxxx   [...] -author
***************************************************************************************************************
*/

/*
    Script Concept: This script, set up as a before-update ae_p_phs_e Advanced (es6) script, enforces all
    the business rules stipulated to occur when a Phase is updated ever.  E.g., In the first version's case, the
    script enforces the business rule of not letting a Phase get set to "Phase Complete" until the inspection's
    complete.  This helps us ensure our workers are completing all their tasks before getting the Phase off
    their plate.

    Script design: The script executes a series of functions that map to business rules, thus enforcing one-by-one
    each rule that you want to execute before a Phase changes states.  
    Program Governance Rules:
    1) All business rule functions return true IFF successful.
       1.a) A false return will be considered an overall fail for the script
       2.b) When there's an overall fail,  "false;" shall be the last statement to be executed in the program, so
            that newDocument's errors can be printed to the screen for the user to see to guide them to the
            appropriate corrective action(s)
    2) Everything that is logged is logged to the catalina/stderr server logs, unconditionally. All text is also
       logged to the Batch Event log IFF DEBUG==true.
    3) Errors should be displayed to the user.  This is an action code that fires typically when there's a human
       interacting with the AiM website, so reader-friendly, helpful error messages to point people in the right
       direction are a must.  Usability should be a primary concern.
    4) Parameterize as much as possible, in order to maximize non-programmer administrative users' power over
       the action code's execution.

*/


 //Since we're using common/standard modules, we need a bootstrap Require
const MODULE_PATH = standardModulePath;
bootStrapRequire();

//Background infrastructure to the action code:
const APP_CONTEXT = com.maximus.fmax.common.framework.util.Application.getInstance().getContext();
const CONFIGURATION = require(MODULE_PATH + "action-code-configuration_1.0");
const CONFIG_INSTANCE = CONFIGURATION.createTriggeredInstance(actionCodeDocument);
var assetMgtFacade = new com.maximus.fmax.assetmgt.AssetMgtFacade(APP_CONTEXT);
 //Advanced Script Parameters
const DEBUG = CONFIG_INSTANCE.get("DEBUG", false);
//second parameter of .get() is a UW-Madison specific set of statuses
const PROHIBITED_STATUSES = CONFIG_INSTANCE.get("PROHIBITED_STATUSES", ["PHASE COMPLETE", "SHOP DONE"]);

/* Setup the loggers. For catalina/stderr that means calling LOG_MESSAGE.init.
   For the Batch Event Log, we only use it when in DEBUG mode,
   so since we might not use it, we'll set it up later.
   For now we'll just keep track off stuff we *might* want to print to the 
   Batch Event log in the logRecords array. */
const ACTION_CODE_TITLE = "ACTION CODE ENFORCE PHASE COMPLETE RULES";
const VERSION = "1.0";
const LOG_MSG_PREFIX = ACTION_CODE_TITLE + " " + VERSION + " ";
const LOG_MESSAGE = require(MODULE_PATH + "log-message_1.0");
LOG_MESSAGE.init(LOG_MSG_PREFIX, DEBUG);
var logRecords = [];

/* Start of actual script code */
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
    if(DEBUG) {
        writeToBatchEvent();
    }
}
if(!success){
    //never put anything after this *ever* -
    //a simple "false;" statement needs to be
    //the last statement in order for newDocument's
    //error list to print to the screen
    false;
}
else {
    log("STOPPING - COMPLETED WITHOUT FATAL ERRORS");
}

function runScript() {
    // Need to clear any potentially lingering errors on the screen or a previous warning could still be there
    // and the user will get stuck on a modal dialogue
    let phase = newDocument;
    phase.clearErrors();

    //Enforce business rules one-by-one by conjoining the
    //success/fail result of each previous rule with the
    //current one.  E.g., in the future there might be
    //a subsequent line like:
    //status = status && updateDescriptionWithAssetInfo
    
    //Business Rule(s) 1: Prevent any invalid status
    //changes.  Currently just preventing the user from
    //making certain status changes when (if it exists)
    //the associated/child inspection is still open.
    let status = true;
    status = status && preventInvalidStatusChange(phase);

    return status;
}
/* End of actual script code */


/* Main Business Rules Functions */

//Prevent any invalid status
//changes.  Currently just preventing the user from
//making certain status changes when (if it exists)
//the associated/child inspection is still open.
function preventInvalidStatusChange(phase) {
    let proposal = phase.getProposal();
    let sortCode = phase.getSortCode();
    let phsStrForLog = proposal + "-" + sortCode;
    let phaseStatus = phase.getStatusCode();
    log("Processing " + phsStrForLog + " moving to Status: " + phaseStatus);
    if(PROHIBITED_STATUSES.indexOf(phaseStatus) < 0) {
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
                logIfDebug("ERROR: This Phase's inspection, " + inspection.getInspectionNo() + ", is not CLOSED or CANCELED.");
                //The below causes the text in errorText to pop up to the AiM or Go user once it is added to the action code's
                //errorlist via newDocument.addError conjoined with the condition that the action code's last statement is just
                //a simple "false;"
                let errorText = ["YOU MUST SUBMIT THIS PHASE'S INSPECTION BEFORE CHANGING THE STATUS TO " + phaseStatus]
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

/* Logging functions */
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
        //This line is for debugging the logging.  Wy isn't writing to ae_event_log
        //working????? -mgracz
        //LOG_MESSAGE.getInstance().logMessage("Inside LogMsg: " + logMsg);
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
