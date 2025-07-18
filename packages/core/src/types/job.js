// Job types - core job definitions and lifecycle management
export var JobStatus;
(function (JobStatus) {
    JobStatus["PENDING"] = "pending";
    JobStatus["QUEUED"] = "queued";
    JobStatus["ASSIGNED"] = "assigned";
    JobStatus["ACCEPTED"] = "accepted";
    JobStatus["IN_PROGRESS"] = "in_progress";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
    JobStatus["CANCELLED"] = "cancelled";
    JobStatus["TIMEOUT"] = "timeout";
    JobStatus["UNWORKABLE"] = "unworkable";
})(JobStatus || (JobStatus = {}));
//# sourceMappingURL=job.js.map