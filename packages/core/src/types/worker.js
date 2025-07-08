// Worker types - capabilities, status, and registration
export var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["INITIALIZING"] = "initializing";
    WorkerStatus["IDLE"] = "idle";
    WorkerStatus["BUSY"] = "busy";
    WorkerStatus["PAUSED"] = "paused";
    WorkerStatus["STOPPING"] = "stopping";
    WorkerStatus["OFFLINE"] = "offline";
    WorkerStatus["ERROR"] = "error";
    WorkerStatus["MAINTENANCE"] = "maintenance";
})(WorkerStatus || (WorkerStatus = {}));
//# sourceMappingURL=worker.js.map