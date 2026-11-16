using System;
using Newtonsoft.Json.Linq;

namespace ElimuAR
{
    // An assignment as the learner plays it: which activity, when it is due, any time limit, and how many
    // attempts are left (counting attempts handed in on this device that are still waiting for the network).
    public class AssignmentRun
    {
        public string Id, Title, ClassName, ActivityKey, TeacherNote;
        public DateTime? DueAt;             // UTC
        public int TimeLimitMinutes;        // 0: none
        public int AttemptsAllowed;         // 0: unlimited
        public int AttemptsUsed;            // as the server last said
        public int? BestScore;

        /// <summary>A row of /api/assignments/me.</summary>
        public static AssignmentRun From(JToken r)
        {
            var rules = r["rules"];
            return new AssignmentRun
            {
                Id = r.Value<string>("assignmentId"),
                Title = r.Value<string>("lessonTitle"),
                ClassName = r.Value<string>("className"),
                ActivityKey = r.Value<string>("activityKey"),
                TeacherNote = r.Value<string>("teacherNote"),
                DueAt = Date(r["dueAt"]),
                TimeLimitMinutes = Int(rules?["timeLimitMinutes"]),
                AttemptsAllowed = Int(rules?["attemptsAllowed"]),
                AttemptsUsed = Int(rules?["attemptsUsed"]),
                BestScore = r["bestScorePercent"] == null || r["bestScorePercent"].Type == JTokenType.Null
                    ? (int?)null : Int(r["bestScorePercent"]),
            };
        }

        public int AttemptsTaken => AttemptsUsed + Scores.QueuedSubmissions(Id);
        public bool OutOfAttempts => AttemptsAllowed > 0 && AttemptsTaken >= AttemptsAllowed;
        public bool Closed => DueAt.HasValue && DateTime.UtcNow >= DueAt.Value;
        public bool CanStart => !Closed && !OutOfAttempts;

        /// <summary>When an attempt begun at <paramref name="startedUtc"/> must be handed in, if ever.</summary>
        public DateTime? Deadline(DateTime startedUtc)
        {
            DateTime? limit = TimeLimitMinutes > 0 ? startedUtc.AddMinutes(TimeLimitMinutes) : (DateTime?)null;
            if (DueAt.HasValue && (!limit.HasValue || DueAt.Value < limit.Value)) return DueAt;
            return limit;
        }

        private static int Int(JToken t) =>
            t == null || t.Type == JTokenType.Null ? 0 : (int)Math.Round(t.Value<double>());

        private static DateTime? Date(JToken t)
        {
            if (t == null || t.Type == JTokenType.Null) return null;
            if (t.Type == JTokenType.Date) return t.Value<DateTime>().ToUniversalTime();
            return DateTime.TryParse((string)t, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out var d)
                ? d : (DateTime?)null;
        }
    }
}
