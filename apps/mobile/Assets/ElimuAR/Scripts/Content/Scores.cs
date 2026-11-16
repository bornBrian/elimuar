using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>High scores, per signed-in learner.</summary>
    public static class Scores
    {
        private class Store
        {
            public Dictionary<string, int> best = new Dictionary<string, int>();
            public List<JObject> pending = new List<JObject>();
            // An assignment attempt that has reached its questions and is not handed in yet.
            public JObject draft;
        }

        private static Store _store;
        private static bool _flushing;

        /// <summary>Runs waiting on this device for the network.</summary>
        public static int Pending => Data.pending.Count;
        private static string FilePath => Path.Combine(Application.persistentDataPath, "scores-" + Session.UserId + ".json");

        private static Store Data
        {
            get
            {
                if (_store != null) return _store;
                try
                {
                    _store = File.Exists(FilePath) ? JsonConvert.DeserializeObject<Store>(File.ReadAllText(FilePath)) : null;
                }
                catch (Exception) { _store = null; }
                return _store ??= new Store();
            }
        }

        private static void Save() => File.WriteAllText(FilePath, JsonConvert.SerializeObject(Data));

        public static void ResetForUser() { _store = null; _flushing = false; }

        /// <summary>The best score on this activity, or -1 when it has never been finished.</summary>
        public static int Best(string key) => Data.best.TryGetValue(key, out var s) ? s : -1;

        /// <summary>Records a run locally and queues it for the server.</summary>
        public static void Record(string key, string runId, string status, int shown, int correct, int seconds)
        {
            if (status != "in_progress" && shown > 0)
            {
                var score = Mathf.RoundToInt(100f * correct / shown);
                if (score > Best(key)) Data.best[key] = score;
            }
            Data.pending.Add(new JObject
            {
                ["key"] = key,
                ["body"] = new JObject
                {
                    ["status"] = status,
                    ["questionsShown"] = shown,
                    ["questionsCorrect"] = correct,
                    ["durationSeconds"] = Mathf.Clamp(seconds, 0, 86400),
                    ["runId"] = runId,
                    ["reportId"] = Guid.NewGuid().ToString("N"),
                    ["playedAt"] = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                },
            });
            Save();
        }

        /// <summary>Hands in an assignment attempt: kept on the device until the server has it.</summary>
        public static void Submit(string assignmentId, string key, JObject body)
        {
            var shown = (int)body["questionsShown"];
            if (shown > 0)
            {
                var score = Mathf.RoundToInt(100f * (int)body["questionsCorrect"] / shown);
                if (score > Best(key)) Data.best[key] = score;
            }
            Data.pending.Add(Handin(assignmentId, key, body));
            Data.draft = null;
            Save();
        }

        /// <summary>Attempts at an assignment handed in here that the server has not got yet.</summary>
        public static int QueuedSubmissions(string assignmentId)
        {
            var n = 0;
            foreach (var item in Data.pending) if ((string)item["assignmentId"] == assignmentId) n++;
            return n;
        }

        /// <summary>Keeps the attempt in progress, to hand in if the app is closed part-way.</summary>
        public static void SaveDraft(string assignmentId, string key, JObject body)
        {
            Data.draft = Handin(assignmentId, key, body);
            Save();
        }

        public static void ClearDraft()
        {
            if (Data.draft == null) return;
            Data.draft = null;
            Save();
        }

        /// <summary>An attempt left part-way when the app closed is handed in now, as it stood.</summary>
        public static void HandInDraft()
        {
            if (Data.draft == null) return;
            Data.pending.Add(Data.draft);
            Data.draft = null;
            Save();
        }

        private static JObject Handin(string assignmentId, string key, JObject body) => new JObject
        {
            ["key"] = key,
            ["assignmentId"] = assignmentId,
            ["path"] = "/api/activities/" + key + "/assignments/" + assignmentId + "/submit",
            ["body"] = body,
        };

        // Sends every queued run, oldest first; stops at the first network failure and leaves the rest
        // queued.
        public static IEnumerator Flush()
        {
            if (!Session.IsStudent || _flushing) yield break;
            _flushing = true;
            try
            {
                while (Data.pending.Count > 0)
                {
                    var item = Data.pending[0];
                    var sent = false;
                    var drop = false;
                    var path = (string)item["path"] ?? "/api/activities/" + item["key"] + "/progress";
                    yield return Api.Post(path, (JObject)item["body"],
                        _ => sent = true,
                        f => drop = !f.Offline && f.Status != 401 && f.Status < 500);
                    if (!sent && !drop) yield break;
                    Data.pending.RemoveAt(0);
                    Save();
                }
            }
            finally
            {
                _flushing = false;
            }
        }

        /// <summary>Raises local bests to what the server holds (from any device).</summary>
        public static IEnumerator Pull()
        {
            JToken data = null;
            yield return Api.Get("/api/ar-activities/progress/me", d => data = d, _ => { });
            if (data == null) yield break;
            foreach (var r in data)
            {
                var best = r["bestScorePercent"];
                if (best == null || best.Type == JTokenType.Null) continue;
                var key = (string)r["activityKey"];
                var value = Mathf.RoundToInt((float)best);
                if (value > Best(key)) Data.best[key] = value;
            }
            Save();
        }
    }
}
