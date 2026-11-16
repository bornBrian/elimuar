using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>The signed-in account and the server it belongs to, kept across launches.</summary>
    public static class Session
    {
        /// <summary>The laptop hotspot address the ElimuAR API runs on in a classroom.</summary>
        public const string DefaultServer = "http://192.168.137.1:4000";

        public static string Server
        {
            get => PlayerPrefs.GetString("server", DefaultServer);
            set { PlayerPrefs.SetString("server", value); PlayerPrefs.Save(); }
        }

        public static bool SignedIn => !string.IsNullOrEmpty(AccessToken);
        public static string AccessToken => PlayerPrefs.GetString("access", "");
        public static string RefreshToken => PlayerPrefs.GetString("refresh", "");
        public static string UserId => PlayerPrefs.GetString("userId", "");
        public static string Role => PlayerPrefs.GetString("role", "");
        public static bool IsStudent => Role == "student";
        public static bool IsStaff => SignedIn && !IsStudent;
        public static string FirstName => PlayerPrefs.GetString("firstName", "");
        public static string LastName => PlayerPrefs.GetString("lastName", "");
        public static string FullName => (FirstName + " " + LastName).Trim();
        public static string SchoolName => PlayerPrefs.GetString("schoolName", "");
        public static string ClassName => PlayerPrefs.GetString("className", "");

        public static bool WelcomeSeen
        {
            get => PlayerPrefs.GetInt("welcomeSeen", 0) == 1;
            set { PlayerPrefs.SetInt("welcomeSeen", value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static void SetTokens(string access, string refresh)
        {
            PlayerPrefs.SetString("access", access);
            PlayerPrefs.SetString("refresh", refresh);
            PlayerPrefs.Save();
        }

        /// <summary>Stores a login response's { user, tokens }.</summary>
        public static void SignIn(JObject data)
        {
            var user = (JObject)data["user"];
            var tokens = (JObject)data["tokens"];
            PlayerPrefs.SetString("access", (string)tokens["accessToken"]);
            PlayerPrefs.SetString("refresh", (string)tokens["refreshToken"]);
            PlayerPrefs.SetString("userId", (string)user["userId"]);
            PlayerPrefs.SetString("role", (string)user["role"]);
            PlayerPrefs.SetString("firstName", (string)user["firstName"] ?? "");
            PlayerPrefs.SetString("lastName", (string)user["lastName"] ?? "");
            PlayerPrefs.SetString("schoolName", user.Value<string>("schoolName") ?? "");
            PlayerPrefs.SetString("className", user.Value<string>("className") ?? "");
            PlayerPrefs.Save();
        }

        /// <summary>Refreshes the stored profile (name, school, class) from /api/auth/me.</summary>
        public static void UpdateUser(JObject user)
        {
            if (user == null) return;
            PlayerPrefs.SetString("firstName", (string)user["firstName"] ?? FirstName);
            PlayerPrefs.SetString("lastName", (string)user["lastName"] ?? LastName);
            PlayerPrefs.SetString("schoolName", user.Value<string>("schoolName") ?? "");
            PlayerPrefs.SetString("className", user.Value<string>("className") ?? "");
            PlayerPrefs.Save();
        }

        public static void SignOut()
        {
            foreach (var key in new[] { "access", "refresh", "userId", "role", "firstName", "lastName", "schoolName", "className" })
                PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
        }
    }
}
