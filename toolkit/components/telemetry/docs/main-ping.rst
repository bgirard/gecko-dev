
"main" ping
===========

This is the "main" Telemetry ping type, whose payload contains most of the measurements that are used to track the performance and health of Firefox in the wild.
It includes the histograms and other performance and diagnostic data.

This ping is triggered by different scenarios, which is documented by the ``reason`` field:

* ``aborted-session`` - this ping is regularly saved to disk (every 5 minutes), overwriting itself, and deleted at shutdown. If a previous aborted session ping is found at startup, it gets sent to the server. The first aborted-session ping is generated as soon as Telemetry starts
* ``environment-change`` - the :doc:`environment` changed, so the session measurements got reset and a new subsession starts
* ``shutdown`` - triggered when the browser session ends
* ``daily`` - a session split triggered in 24h hour intervals at local midnight. If an ``environment-change`` ping is generated by the time it should be sent, the daily ping is rescheduled for the next midnight
* ``saved-session`` - the *"classic"* Telemetry payload with measurements covering the whole browser session (only submitted for a transition period)

Most reasons lead to a session split, initiating a new *subsession*. We reset important measurements for those subsessions.

*Note:* ``saved-session`` is sent with a different ping type (``saved-session``, not ``main``), but otherwise has the same format as discussed here.

Structure::

    {
      version: 4,

      info: {
        reason: <string>, // what triggered this ping: "saved-session", "environment-change", "shutdown", ...
        revision: <string>, // the Histograms.json revision
        timezoneOffset: <integer>, // time-zone offset from UTC, in minutes, for the current locale
        previousBuildId: <string>, // null if this is the first run, or the previous build ID is unknown

        sessionId: <uuid>,  // random session id, shared by subsessions
        subsessionId: <uuid>,  // random subsession id
        previousSessionId: <uuid>, // session id of the previous session, null on first run.
        previousSubsessionId: <uuid>, // subsession id of the previous subsession (even if it was in a different session),
                                      // null on first run.

        subsessionCounter: <unsigned integer>, // the running no. of this subsession since the start of the browser session
        profileSubsessionCounter: <unsigned integer>, // the running no. of all subsessions for the whole profile life time

        sessionStartDate: <ISO date>, // daily precision
        subsessionStartDate: <ISO date>, // daily precision, ISO date in local time
        sessionLength: <integer>, // the session length until now in seconds, monotonic
        subsessionLength: <integer>, // the subsession length in seconds, monotonic

        flashVersion: <string>, // obsolete, use ``environment.addons.activePlugins``
        addons: <string>, // obsolete, use ``environment.addons``
      },

      childPayloads: [...], // only present with e10s; reduced payloads from content processes, null on failure
      simpleMeasurements: {...},

      // The following properties may all be null if we fail to collect them.
      histograms: {...},
      keyedHistograms: {...},
      scalars: {...},
      chromeHangs: {...},
      threadHangStats: [...],
      log: [...],
      webrtc: {...},
      fileIOReports: {...},
      lateWrites: {...},
      addonDetails: {...},
      addonHistograms: {...},
      UIMeasurements: [...],
      slowSQL: {...},
      slowSQLstartup: {...},
    }

info
----

sessionLength
~~~~~~~~~~~~~
The length of the current session so far in seconds.
This uses a monotonic clock, so this may mismatch with other measurements that
are not monotonic like calculations based on ``Date.now()``.

If the monotonic clock failed, this will be ``-1``.

subsessionLength
~~~~~~~~~~~~~~~~
The length of this subsession in seconds.
This uses a monotonic clock, so this may mismatch with other measurements that are not monotonic (e.g. based on Date.now()).

If ``sessionLength`` is ``-1``, the monotonic clock is not working.

childPayloads
-------------
The Telemetry payloads sent by child processes, recorded on child process shutdown (event ``content-child-shutdown`` observed) and whenever ``TelemetrySession.requestChildPayloads()`` is called (currently only used in tests). They are reduced session payloads, only available with e10s. Among some other things, they don't report addon details, addon histograms or UI Telemetry.

Any histogram whose Accumulate call happens on a child process will be accumulated into a childPayload's histogram, not the parent's. As such, some histograms in childPayloads will contain different data (e.g. ``GC_MS`` will be much different in childPayloads, for instance, because the child GC needs to content with content scripts and parent doesn't) and some histograms will be absent (``EVENTLOOP_UI_ACTIVITY`` is parent-process-only because it measures inter-event timings where the OS delivers the events in the parent).

Note: Child payloads are not collected and cleared with subsession splits, they are currently only meaningful when analysed from ``saved-session`` or ``main`` pings with ``reason`` set to ``shutdown``.

simpleMeasurements
------------------
This section contains a list of simple measurements, or counters. In addition to the ones highlighted below, Telemetry timestamps (see `here <https://dxr.mozilla.org/mozilla-central/search?q=%22TelemetryTimestamps.add%22&redirect=false&case=true>`_ and `here <https://dxr.mozilla.org/mozilla-central/search?q=%22recordTimestamp%22&redirect=false&case=true>`_) can be reported.

totalTime
~~~~~~~~~
A non-monotonic integer representing the number of seconds the session has been alive.

uptime
~~~~~~
A non-monotonic integer representing the number of minutes the session has been alive.

addonManager
~~~~~~~~~~~~
Only available in the extended set of measures, it contains a set of counters related to Addons. See `here <https://dxr.mozilla.org/mozilla-central/search?q=%22AddonManagerPrivate.recordSimpleMeasure%22&redirect=false&case=true>`_ for a list of recorded measures.

UITelemetry
~~~~~~~~~~~
Only available in the extended set of measures. See the documentation for :doc:`/browser/docs/UITelemetry <UITelemetry>`.

startupInterrupted
~~~~~~~~~~~~~~~~~~
A boolean set to true if startup was interrupted by an interactive prompt.

js
~~
This section contains a series of counters from the JavaScript engine.

Structure::

    "js" : {
      "setProto": <unsigned integer>, // Number of times __proto__ is set
      "customIter": <unsigned integer> // Number of times __iterator__ is used (i.e., is found for a for-in loop)
    }

maximalNumberOfConcurrentThreads
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
An integer representing the highest number of threads encountered so far during the session.

startupSessionRestoreReadBytes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Windows-only integer representing the number of bytes read by the main process up until the session store has finished restoring the windows.

startupSessionRestoreWriteBytes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Windows-only integer representing the number of bytes written by the main process up until the session store has finished restoring the windows.

startupWindowVisibleReadBytes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Windows-only integer representing the number of bytes read by the main process up until after a XUL window is made visible.

startupWindowVisibleWriteBytes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Windows-only integer representing the number of bytes written by the main process up until after a XUL window is made visible.

debuggerAttached
~~~~~~~~~~~~~~~~
A boolean set to true if a debugger is attached to the main process.

shutdownDuration
~~~~~~~~~~~~~~~~
The time, in milliseconds, it took to complete the last shutdown.

failedProfileLockCount
~~~~~~~~~~~~~~~~~~~~~~
The number of times the system failed to lock the user profile.

savedPings
~~~~~~~~~~
Integer count of the number of pings that need to be sent.

activeTicks
~~~~~~~~~~~
Integer count of the number of five-second intervals ('ticks') the user was considered 'active' (sending UI events to the window). An extra event is fired immediately when the user becomes active after being inactive. This is for some mouse and gamepad events, and all touch, keyboard, wheel, and pointer events (see `EventStateManager.cpp <https://dxr.mozilla.org/mozilla-central/rev/e6463ae7eda2775bc84593bb4a0742940bb87379/dom/events/EventStateManager.cpp#549>`_).
This measure might be useful to give a trend of how much a user actually interacts with the browser when compared to overall session duration. It does not take into account whether or not the window has focus or is in the foreground. Just if it is receiving these interaction events.
Note that in ``main`` pings, this measure is reset on subsession splits, while in ``saved-session`` pings it covers the whole browser session.

pingsOverdue
~~~~~~~~~~~~
Integer count of pending pings that are overdue.

histograms
----------
This section contains the histograms that are valid for the current platform. ``Flag`` and ``count`` histograms are always created and submitted, with their default value being respectively ``false`` and ``0``. Other histogram types (`see here <https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Adding_a_new_Telemetry_probe#Choosing_a_Histogram_Type>`_) are not created nor submitted if no data was added to them. The type and format of the reported histograms is described by the ``Histograms.json`` file. Its most recent version is available `here <https://dxr.mozilla.org/mozilla-central/source/toolkit/components/telemetry/Histograms.json>`_. The ``info.revision`` field indicates the revision of the file that describes the reported histograms.

keyedHistograms
---------------
This section contains the keyed histograms available for the current platform.

As of Firefox 48, this section does not contain empty keyed histograms anymore.

scalars
----------
This section contains the :doc:`scalars` that are valid for the current platform. Scalars are not created nor submitted if no data was added to them, and are only reported with subsession pings. Their type and format is described by the ``Scalars.yaml`` file. Its most recent version is available `here <https://dxr.mozilla.org/mozilla-central/source/toolkit/components/telemetry/Scalars.yaml>`_. The ``info.revision`` field indicates the revision of the file that describes the reported scalars.

threadHangStats
---------------
Contains the statistics about the hangs in main and background threads. Note that hangs in this section capture the [C++ pseudostack](https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Profiling_with_the_Built-in_Profiler#Native_stack_vs._Pseudo_stack) and an incomplete JS stack, which is not 100% precise.

To avoid submitting overly large payloads, some limits are applied:

* Identical, adjacent "(chrome script)" or "(content script)" stack entries are collapsed together. If a stack is reduced, the "(reduced stack)" frame marker is added as the oldest frame.
* The depth of the reported stacks is limited to 11 entries. This value represents the 99.9th percentile of the thread hangs stack depths reported by Telemetry.

Structure::

    "threadHangStats" : [
      {
        "name" : "Gecko",
        "activity" : {...}, // a time histogram of all task run times
        "hangs" : [
          {
            "stack" : [
              "Startup::XRE_Main",
              "Timer::Fire",
              "(content script)",
              "IPDL::PPluginScriptableObject::SendGetChildProperty",
              ... up to 11 frames ...
            ],
            "nativeStack": [...], // optionally available
            "histogram" : {...}, // the time histogram of the hang times
            "annotations" : [
              {
                "pluginName" : "Shockwave Flash",
                "pluginVersion" : "18.0.0.209"
              },
              ... other annotations ...
            ]
          },
        ],
      },
      ... other threads ...
     ]

chromeHangs
-----------
Contains the statistics about the hangs happening exclusively on the main thread of the parent process. Precise C++ stacks are reported. This is only available on Nightly Release on Windows, when building using "--enable-profiling" switch.

Some limits are applied:

* Reported chrome hang stacks are limited in depth to 50 entries.
* The maximum number of reported stacks is 50.

Structure::

    "chromeHangs" : {
      "memoryMap" : [
        ["wgdi32.pdb", "08A541B5942242BDB4AEABD8C87E4CFF2"],
        ["igd10iumd32.pdb", "D36DEBF2E78149B5BE1856B772F1C3991"],
        ... other entries in the format ["module name", "breakpad identifier"] ...
       ],
      "stacks" : [
        [
          [
            0, // the module index or -1 for invalid module indices
            190649 // the offset of this program counter in its module or an absolute pc
          ],
          [1, 2540075],
          ... other frames, up to 50 ...
         ],
         ... other stacks, up to 50 ...
      ],
      "durations" : [8, ...], // the hang durations (in seconds)
      "systemUptime" : [692, ...], // the system uptime (in minutes) at the time of the hang
      "firefoxUptime" : [672, ...], // the Firefox uptime (in minutes) at the time of the hang
      "annotations" : [
        [
          [0, ...], // the indices of the related hangs
          {
            "pluginName" : "Shockwave Flash",
            "pluginVersion" : "18.0.0.209",
            ... other annotations as key:value pairs ...
          }
        ],
        ...
      ]
    },

log
---
This section contains a log of important or unusual events reported through Telemetry.

Structure::

    "log": [
      [
        "Event_ID",
        3785, // the timestamp (in milliseconds) for the log entry
        ... other data ...
      ],
      ...
    ]


webrtc
------
Contains special statistics gathered by WebRTC related components.

So far only a bitmask for the ICE candidate type present in a successful or
failed WebRTC connection is getting reported through C++ code as
IceCandidatesStats, because the required bitmask is too big to be represented
in a regular enum histogram. Further this data differentiates between Loop
(aka Firefox Hello) connections and everything else, which is categorized as
WebRTC.

Note: in most cases the webrtc and loop dictionaries inside of
IceCandidatesStats will simply be empty as the user has not used any WebRTC
PeerConnection at all during the ping report time.

Structure::

    "webrtc": {
      "IceCandidatesStats": {
        "webrtc": {
          "34526345": {
            "successCount": 5
          },
          "2354353": {
            "failureCount": 1
          }
        },
        "loop": {
          "2349346359": {
            "successCount": 3
          },
          "73424": {
            "successCount": 1,
            "failureCount": 5
          }
        }
      }
    },

fileIOReports
-------------
Contains the statistics of main-thread I/O recorded during the execution. Only the I/O stats for the XRE and the profile directories are currently reported, neither of them disclosing the full local path.

Structure::

    "fileIOReports": {
      "{xre}": [
        totalTime, // Accumulated duration of all operations
        creates, // Number of create/open operations
        reads, // Number of read operations
        writes, // Number of write operations
        fsyncs, // Number of fsync operations
        stats, // Number of stat operations
      ],
      "{profile}": [ ... ],
      ...
    }

lateWrites
----------
This sections reports writes to the file system that happen during shutdown. The reported data contains the stack and the loaded libraries at the time the writes happened.

Structure::

    "lateWrites" : {
      "memoryMap" : [
        ["wgdi32.pdb", "08A541B5942242BDB4AEABD8C87E4CFF2"],
        ... other entries in the format ["module name", "breakpad identifier"] ...
       ],
      "stacks" : [
        [
          [
            0, // the module index or -1 for invalid module indices
            190649 // the offset of this program counter in its module or an absolute pc
          ],
          [1, 2540075],
          ... other frames ...
         ],
         ... other stacks ...
      ],
    },

addonDetails
------------
This section contains per-addon telemetry details, as reported by each addon provider. The XPI provider is the only one reporting at the time of writing (`see DXR <https://dxr.mozilla.org/mozilla-central/search?q=setTelemetryDetails&case=true>`_). Telemetry does not manipulate or enforce a specific format for the supplied provider's data.

Structure::

    "addonDetails": {
      "XPI": {
        "adbhelper@mozilla.org": {
          "scan_items": 24,
          "scan_MS": 3,
          "location": "app-profile",
          "name": "ADB Helper",
          "creator": "Mozilla & Android Open Source Project",
          "startup_MS": 30
        },
        ...
      },
      ...
    }

addonHistograms
---------------
This section contains the histogram registered by the addons (`see here <https://dxr.mozilla.org/mozilla-central/rev/584870f1cbc5d060a57e147ce249f736956e2b62/toolkit/components/telemetry/nsITelemetry.idl#303>`_). This section is not present if no addon histogram is available.

UITelemetry
-----------
See the ``UITelemetry data format`` documentation.

slowSQL
-------
This section contains the informations about the slow SQL queries for both the main and other threads. The execution of an SQL statement is considered slow if it takes 50ms or more on the main thread or 100ms or more on other threads. Slow SQL statements will be automatically trimmed to 1000 characters. This limit doesn't include the ellipsis and database name, that are appended at the end of the stored statement.

Structure::

    "slowSQL": {
      "mainThread": {
        "Sanitized SQL Statement": [
          1, // the number of times this statement was hit
          200  // the total time (in milliseconds) that was spent on this statement
        ],
        ...
      },
      "otherThreads": {
        "VACUUM /* places.sqlite */": [
          1,
          330
        ],
        ...
      }
    },

slowSQLStartup
--------------
This section contains the slow SQL statements gathered at startup (until the "sessionstore-windows-restored" event is fired). The structure of this section resembles the one for `slowSQL`_.

UIMeasurements
--------------
This section contains UI specific telemetry measurements and events. This section is mainly populated with Android-specific data and events (`see here <https://dxr.mozilla.org/mozilla-central/search?q=regexp%3AUITelemetry.%28addEvent|startSession|stopSession%29&redirect=false&case=false>`_).

Structure::

    "UIMeasurements": [
      {
        "type": "event", // either "session" or "event"
        "action": "action.1",
        "method": "menu",
        "sessions": [],
        "timestamp": 12345,
        "extras": "settings"
      },
      {
        "type": "session",
        "name": "awesomescreen.1",
        "reason": "commit",
        "start": 123,
        "end": 456
      }
      ...
    ],
