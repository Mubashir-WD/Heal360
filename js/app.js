// js/app.js
import { db } from './services/database.js';
import { auth, onAuthStateChanged, signOut } from './services/auth.js';
import { notifyClockStatus, notifyLeaveRequest, notifyLateLogin, notifyAttendanceIssue } from './services/notifications.js';
import {
    collection, addDoc, getDocs, query, where,
    doc, getDoc, updateDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// DOMContentLoaded wrapper removed for direct module execution

    let CURRENT_USER_ID = null;
    let usersMap = {};

    // --- AUTHENTICATION GATE ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!CURRENT_USER_ID) {
                CURRENT_USER_ID = user.uid;
                fetchFirestoreData();
            }
        } else {
            console.log("[Auth] Session expired or logged out. Redirecting...");
            window.location.replace("login.html");
        }
    });

    // --- STATE INITIALIZATION ---
    let appState = {
        attendance: {
            activeDocId: null,
            isClockedIn: false,
            clockInTime: null,
            totalSeconds: 0,
            history: []
        },
        profile: {
            name: 'Loading...',
            email: '...',
            phone: '...',
            dob: '...',
            gender: 'other',
            designation: 'New Employee',
            department: 'Unassigned',
            employeeId: 'HM-0000',
            status: 'active',
            avatar: 'https://ui-avatars.com/api/?name=Loading&background=4F46E5&color=fff',
            emergencyContact: '',
            joinDate: '',
            expiryDate: '',
            bloodGroup: ''
        }
    };

    const gmtFormat = { timeZone: 'Europe/London' };

    // --- ROUTING (SPA) ---
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitleText = document.getElementById('pageTitleText');

    function navigateTo(hash) {
        if (!hash || hash === '') hash = '#dashboard';
        viewSections.forEach(sec => sec.style.display = 'none');
        navLinks.forEach(nav => nav.classList.remove('active'));

        let targetNav = document.querySelector(`.nav-link[href="${hash}"]`);
        if (!targetNav) { targetNav = document.querySelector('.nav-link[href="#dashboard"]'); hash = '#dashboard'; }

        if (targetNav) {
            const targetViewId = targetNav.getAttribute('data-target');
            const targetView = document.getElementById(targetViewId);
            if (targetView) targetView.style.display = 'block';
            targetNav.classList.add('active');

            const titleMap = {
                '#dashboard': 'Dashboard',
                '#attendance': 'Attendance Records',
                '#timeoff': 'Time Off Overview',
                '#directory': 'Employee Directory',
                '#settings': 'Account Settings'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'Dashboard';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));

    // Logout Helper Integration
    const logoutBtn = document.createElement('a');
    Object.assign(logoutBtn, {
        href: "#logout", className: "nav-item nav-link",
        innerHTML: `<i data-feather="log-out"></i> Log Out`
    });
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth);
    });
    document.querySelector('.nav-menu').appendChild(logoutBtn);


    // --- UI HELPERS ---
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';

    const timeDisplay = document.getElementById('currentTimeDisplay');
    function updateLiveClock() {
        if (timeDisplay) {
            timeDisplay.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', ...gmtFormat });
        }
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    function initializeUI() {
        const sidebarName = document.getElementById('sidebarName');
        const sidebarRole = document.getElementById('sidebarRole');
        const sidebarAvatar = document.getElementById('sidebarAvatar');

        if (sidebarName) sidebarName.textContent = appState.profile.name;
        if (sidebarRole) sidebarRole.textContent = appState.profile.designation || 'Specialist';
        if (sidebarAvatar) sidebarAvatar.src = appState.profile.avatar;

        const sName = document.getElementById('settingsName');
        const sEmail = document.getElementById('settingsEmail');
        const sPhone = document.getElementById('settingsPhone');
        const sDob = document.getElementById('settingsDob');
        const sGender = document.getElementById('settingsGender');
        const sDesignation = document.getElementById('settingsDesignation');
        const sDepartment = document.getElementById('settingsDepartment');
        const sAvatarPreview = document.getElementById('settingsAvatarPreview');
        const sEmpId = document.getElementById('settingsEmpId');
        const sEmergencyContact = document.getElementById('settingsEmergencyContact');
        const sJoinDate = document.getElementById('settingsJoinDate');
        const sExpiryDate = document.getElementById('settingsExpiryDate');
        const sBloodGroup = document.getElementById('settingsBloodGroup');

        if (sName) sName.value = appState.profile.name || '';
        if (sEmail) sEmail.value = appState.profile.email || '';
        if (sPhone) sPhone.value = appState.profile.phone || '';
        if (sDob) sDob.value = appState.profile.dob || '';
        if (sGender) sGender.value = appState.profile.gender || 'other';
        if (sDesignation) sDesignation.value = appState.profile.designation || '';
        if (sDepartment) sDepartment.value = appState.profile.department || '';
        if (sEmpId) sEmpId.value = appState.profile.employeeId || '';
        if (sAvatarPreview) sAvatarPreview.src = appState.profile.avatar;
        if (sEmergencyContact) sEmergencyContact.value = appState.profile.emergencyContact || '';
        if (sJoinDate) sJoinDate.value = appState.profile.joinDate || '';
        if (sExpiryDate) sExpiryDate.value = appState.profile.expiryDate || '';
        if (sBloodGroup) sBloodGroup.value = appState.profile.bloodGroup || '';

        updateIDCard();
    }

    // --- FIRESTORE DATA FETCHING W/ REALTIME SNAPSHOTS ---
    function fetchFirestoreData() {
        console.log("[Firebase] Setting up realtime listeners...");
        const userRef = doc(db, "users", CURRENT_USER_ID);

        // 1. Live Profile Listener
        onSnapshot(userRef, (userSnap) => {
            try {
                let needsUpdate = false;
                let updatePayload = {};

                if (userSnap.exists()) {
                    appState.profile = { ...appState.profile, ...userSnap.data() };
                    
                    // Initialize leaveBalance if missing
                    if (!appState.profile.leaveBalance) {
                        appState.profile.leaveBalance = { annual: 15, sick: 4, festival: 3 };
                        updatePayload.leaveBalance = appState.profile.leaveBalance;
                        needsUpdate = true;
                    }
                    
                    // Dynamic Join Date integration if missing
                    if (!appState.profile.joinDate) {
                        const created = appState.profile.createdAt;
                        if (created) {
                            appState.profile.joinDate = new Date(created).toLocaleDateString('en-CA');
                        } else if (auth.currentUser && auth.currentUser.metadata.creationTime) {
                            appState.profile.joinDate = new Date(auth.currentUser.metadata.creationTime).toLocaleDateString('en-CA');
                        } else {
                            appState.profile.joinDate = new Date().toLocaleDateString('en-CA');
                        }
                        updatePayload.joinDate = appState.profile.joinDate;
                        needsUpdate = true;
                    }
                    
                    // Dynamic Expiry Date integration if missing (5 years after joinDate)
                    if (!appState.profile.expiryDate && appState.profile.joinDate) {
                        const jd = new Date(appState.profile.joinDate);
                        appState.profile.expiryDate = new Date(jd.setFullYear(jd.getFullYear() + 5)).toLocaleDateString('en-CA');
                        updatePayload.expiryDate = appState.profile.expiryDate;
                        needsUpdate = true;
                    }
                } else {
                    console.log("[Auth] Profile not found in database. Access Denied.");
                    alert("Your profile was not found in the HR database. Please contact your administrator.");
                    signOut(auth).then(() => {
                        window.location.replace("login.html");
                    });
                }

                // Disabled Gate Check
                if (appState.profile.status === 'disabled') {
                    alert("Your account has been disabled. Please contact your administrator.");
                    signOut(auth).then(() => {
                        window.location.replace("login.html");
                    });
                    return;
                }

                // Super Admin Redirection Guard
                if (appState.profile.role === 'super_admin') {
                    console.log("[Auth] CEO/Super Admin detected. Redirecting to Admin dashboard...");
                    window.location.replace("admin.html");
                    return;
                }

                // Trigger batch update if needed
                if (needsUpdate) {
                    updateDoc(userRef, updatePayload).catch(err => {
                        console.error("Error batch updating profile defaults:", err);
                    });
                }

                // Populate departments dropdown dynamically
                getDocs(collection(db, "departments")).then(deptsSnap => {
                    const deptSelect = document.getElementById('settingsDepartment');
                    if (deptSelect) {
                        deptSelect.innerHTML = '<option value="">Select Department</option>';
                        deptsSnap.forEach(dDoc => {
                            const dData = dDoc.data();
                            const opt = document.createElement('option');
                            opt.value = dData.name;
                            opt.textContent = dData.name;
                            if (appState.profile.department === dData.name) {
                                opt.selected = true;
                            }
                            deptSelect.appendChild(opt);
                        });
                    }
                }).catch(err => {
                    console.error("Error loading departments in settings:", err);
                });

                initializeUI();
                renderLeaveBalances();

            } catch (err) {
                console.error("Error updating profile snapshot:", err);
            }
        });

        // 2. Live Attendance Logs Listener
        const attRef = collection(db, "attendance_logs");
        const qAtt = query(attRef, where("userId", "==", CURRENT_USER_ID));
        onSnapshot(qAtt, (querySnapshot) => {
            let allLogs = [];
            querySnapshot.forEach((docSnap) => {
                allLogs.push({ id: docSnap.id, ...docSnap.data() });
            });

            allLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));

            appState.attendance.history = [];
            appState.attendance.isClockedIn = false;
            appState.attendance.activeDocId = null;

            let totalWorkingSeconds = 0;
            let lateInCount = 0;
            let earlyInCount = 0;
            let lateOutCount = 0;
            let earlyOutCount = 0;

            allLogs.forEach((data) => {
                if (data.clockOutTime === null) {
                    appState.attendance.activeDocId = data.id;
                    appState.attendance.isClockedIn = true;
                    appState.attendance.clockInTime = data.clockInTime;

                    const now = new Date().getTime();
                    const past = new Date(data.clockInTime).getTime();
                    appState.attendance.totalSeconds = Math.floor((now - past) / 1000);
                } else {
                    const inDate = new Date(data.clockInTime);
                    const outDate = new Date(data.clockOutTime);
                    const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                    let secs = data.totalSeconds || 0;
                    if (secs > 16 * 3600) {
                        secs = 8 * 3600; // Cap shift at 8 hours if elapsed > 16 hours
                    }
                    totalWorkingSeconds += secs;

                    if (data.lateClockIn) lateInCount++;
                    if (data.earlyClockIn) earlyInCount++;
                    if (data.lateClockOut) lateOutCount++;
                    if (data.earlyClockOut) earlyOutCount++;

                    const hours = Math.floor(secs / 3600);
                    const minutes = Math.floor((secs % 3600) / 60);

                    appState.attendance.history.push({
                        date: inDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat }),
                        in: inDate.toLocaleTimeString('en-GB', timeOpts),
                        out: outDate.toLocaleTimeString('en-GB', timeOpts),
                        total: `${hours}h ${minutes}m`,
                        status: 'Completed',
                        statClass: 'status-on-time',
                        attendanceStatus: data.attendanceStatus || 'Completed',
                        lateClockIn: data.lateClockIn || false,
                        earlyClockIn: data.earlyClockIn || false,
                        earlyClockOut: data.earlyClockOut || false,
                        lateClockOut: data.lateClockOut || false
                    });
                }
            });

            // Update stats DOM
            const hWorkingHours = Math.floor(totalWorkingSeconds / 3600);
            const mWorkingMins = Math.floor((totalWorkingSeconds % 3600) / 60);

            const elWorkingHours = document.getElementById('empStatWorkingHours');
            const elLateIn = document.getElementById('empStatLateIn');
            const elEarlyIn = document.getElementById('empStatEarlyIn');
            const elLateOut = document.getElementById('empStatLateOut');
            const elEarlyOut = document.getElementById('empStatEarlyOut');

            if (elWorkingHours) elWorkingHours.textContent = `${hWorkingHours}h ${mWorkingMins}m`;
            if (elLateIn) elLateIn.textContent = lateInCount;
            if (elEarlyIn) elEarlyIn.textContent = earlyInCount;
            if (elLateOut) elLateOut.textContent = lateOutCount;
            if (elEarlyOut) elEarlyOut.textContent = earlyOutCount;

            renderAttendanceState();
        }, (err) => {
            console.error("Attendance logs listener failed:", err);
        });

        // 3. Subscribe to leaves, notices, calendar events, and employee directory
        subscribeMyLeaves();
        subscribeNotices();
        subscribeCalendarData();
        subscribeUsersDirectory();
    }

    function subscribeMyLeaves() {
        const leaveRef = collection(db, "leave_requests");
        const leaveQ = query(leaveRef, where("userId", "==", CURRENT_USER_ID));
        onSnapshot(leaveQ, (leaveSnap) => {
            try {
                let myLeaves = [];
                leaveSnap.forEach((docSnap) => {
                    myLeaves.push({ id: docSnap.id, ...docSnap.data() });
                });

                myLeaves.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

                const leavesTableBody = document.getElementById('employeeLeavesTable');
                let rowsHtml = "";

                const pOpts = { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat };
                const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave', 'festival': 'Festival Leave' };

                for (const request of myLeaves) {
                    const formattedType = typeMap[request.type] || request.type;
                    const reqDateFormatted = new Date(request.requestDate).toLocaleDateString('en-GB', pOpts);

                    let badgeHTML = "";
                    if (request.status === "Pending") badgeHTML = `<span class="status-pill status-late" style="background:#FEF3C7; color:#92400E;">Pending</span>`;
                    else if (request.status === "Approved" || request.status === "Approve") badgeHTML = `<span class="status-pill status-on-time" style="background:#DCFCE7; color:#166534;"><i data-feather="check" style="width:12px;"></i> Approved</span>`;
                    else badgeHTML = `<span class="status-pill" style="background:#FEE2E2; color:#991B1B;"><i data-feather="x" style="width:12px;"></i> Rejected</span>`;

                    rowsHtml += `<tr>
                        <td><strong>${formattedType}</strong></td>
                        <td>${reqDateFormatted}</td>
                        <td>${request.startDate} to ${request.endDate}</td>
                        <td>
                            ${request.notes || "<span style='color:#94A3B8'>No comments</span>"}
                            ${request.remarks ? `<div style="font-size: 0.75rem; color: #4F46E5; margin-top: 4px;"><strong>Remarks:</strong> ${request.remarks} ${request.approvedBy ? `(by ${request.approvedBy})` : ''}</div>` : ''}
                        </td>
                        <td>${badgeHTML}</td>
                    </tr>`;
                }

                if (myLeaves.length === 0) rowsHtml = `<tr><td colspan="5" style="text-align: center; color: #64748B;">You have no leave history.</td></tr>`;

                if (leavesTableBody) {
                    leavesTableBody.innerHTML = rowsHtml;
                    feather.replace();
                }
            } catch (err) {
                console.error("Error rendering leaves snapshot:", err);
            }
        }, (err) => {
            console.error("Leaves snapshot listener failed:", err);
        });
    }

    // --- ATTENDANCE SYSTEM CONTROLS ---
    let timerInterval = null;
    const btnClockIn = document.getElementById('clockInBtn');
    const btnClockOut = document.getElementById('clockOutBtn');
    const valClockIn = document.getElementById('valClockIn');
    const valClockOut = document.getElementById('valClockOut');
    const valTotalHours = document.getElementById('valTotalHours');

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    }

    function renderAttendanceState() {
        if (appState.attendance.isClockedIn) {
            if (btnClockIn) btnClockIn.disabled = true;
            if (btnClockOut) {
                btnClockOut.disabled = false;
                btnClockOut.classList.remove('btn-secondary');
                btnClockOut.classList.add('btn-danger');

                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clocked In`;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }

            const inTimeStr = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...gmtFormat });
            if (valClockIn) valClockIn.textContent = inTimeStr;
            if (valClockOut) valClockOut.textContent = '--:--';

            // Dynamic Clock recalculation bound to absolute reality
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                const now = new Date().getTime();
                const past = new Date(appState.attendance.clockInTime).getTime();
                appState.attendance.totalSeconds = Math.floor((now - past) / 1000);
                if (valTotalHours) valTotalHours.textContent = formatDuration(appState.attendance.totalSeconds);
            }, 1000);

        } else {
            if (btnClockIn) btnClockIn.disabled = false;
            if (btnClockOut) {
                btnClockOut.disabled = true;
                btnClockOut.classList.remove('btn-danger');
                btnClockOut.classList.add('btn-secondary');

                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clock In`;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }

            if (valClockIn) valClockIn.textContent = '--:--';
            if (valClockOut) valClockOut.textContent = '--:--';
            if (valTotalHours) valTotalHours.textContent = '0h 0m';
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        }
        renderHistoryTable();
    }

    function renderHistoryTable() {
        const historyTable = document.getElementById('attendanceHistoryTable');
        const fullTable = document.getElementById('fullAttendanceTable');
        if (!historyTable && !fullTable) return;

        let activeRow = "";
        if (appState.attendance.isClockedIn) {
            const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };
            const rowIn = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', timeOpts);
            const rHours = Math.floor(appState.attendance.totalSeconds / 3600);
            const rMins = Math.floor((appState.attendance.totalSeconds % 3600) / 60);

            activeRow = `
                <tr class="active-shift-row">
                    <td><strong>Today</strong></td>
                    <td>${rowIn}</td>
                    <td>--:--</td>
                    <td><strong>${rHours}h ${rMins}m</strong></td>
                    <td><span class="status-pill status-active">Active Shift</span></td>
                </tr>
            `;
        }

        const hRows = appState.attendance.history.slice(0, 30).map(h => {
            let badgeHTML = `<div class="attendance-badges-list">`;
            if (h.lateClockIn) badgeHTML += `<span class="attendance-badge badge-late-in">Late In</span>`;
            if (h.earlyClockIn) badgeHTML += `<span class="attendance-badge badge-early-in">Early In</span>`;
            if (h.earlyClockOut) badgeHTML += `<span class="attendance-badge badge-early-out">Early Out</span>`;
            if (h.lateClockOut) badgeHTML += `<span class="attendance-badge badge-late-out">Late Out</span>`;
            badgeHTML += `</div>`;
            
            let statusClass = "status-on-time";
            if (h.attendanceStatus === "Late Login" || h.attendanceStatus === "Early Departure" || h.attendanceStatus === "Late In & Early Out") {
                statusClass = "status-late";
            }
            
            return `
                <tr>
                    <td>${h.date}</td>
                    <td>${h.in}</td>
                    <td>${h.out}</td>
                    <td>${h.total}</td>
                    <td>
                        <span class="status-pill ${statusClass}">${h.attendanceStatus || h.status}</span>
                        ${badgeHTML}
                    </td>
                </tr>
            `;
        }).join('');

        const finalHTML = activeRow + hRows;
        if (historyTable) historyTable.innerHTML = finalHTML;
        if (fullTable) fullTable.innerHTML = finalHTML;
    }

    if (btnClockIn) {
        btnClockIn.addEventListener('click', async () => {
            btnClockIn.disabled = true;
            btnClockIn.innerHTML = `<i data-feather="loader"></i> Updating...`;
            feather.replace();

            const startTime = new Date().toISOString();

            try {
                const inDateObj = new Date(startTime);
                const loginHour = parseInt(inDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
                const loginMin = parseInt(inDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));
                const lateClockIn = (loginHour > 9) || (loginHour === 9 && loginMin >= 15);
                const earlyClockIn = (loginHour < 8) || (loginHour === 8 && loginMin < 45);

                const docRef = await addDoc(collection(db, "attendance_logs"), {
                    userId: CURRENT_USER_ID,
                    clockInTime: startTime,
                    clockOutTime: null,
                    totalSeconds: 0,
                    status: "Active Shift",
                    lateClockIn: lateClockIn,
                    earlyClockIn: earlyClockIn,
                    earlyClockOut: false,
                    lateClockOut: false,
                    attendanceStatus: lateClockIn ? "Late Login" : (earlyClockIn ? "Early Clock In" : "On Time")
                });

                appState.attendance.activeDocId = docRef.id;
                appState.attendance.isClockedIn = true;
                appState.attendance.clockInTime = startTime;
                appState.attendance.totalSeconds = 0;
                appState.attendance.lateClockIn = lateClockIn;
                appState.attendance.earlyClockIn = earlyClockIn;

                renderAttendanceState();

                await notifyClockStatus(CURRENT_USER_ID, appState.profile.name, 'Clocked In', startTime, '0', startTime);

                // Check for late login (after 09:15 GMT)
                if (lateClockIn) {
                    await notifyLateLogin(CURRENT_USER_ID, appState.profile.name, startTime);
                }

            } catch (err) {
                console.error("[Firebase] Clock In Failed: ", err);
                alert("Database connection failed. Check your Firebase permissions.");
                btnClockIn.disabled = false;
                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clock In`;
                feather.replace();
            }
        });
    }

    if (btnClockOut) {
        btnClockOut.addEventListener('click', async () => {
            btnClockOut.disabled = true;
            btnClockOut.innerHTML = `<i data-feather="loader"></i> Processing...`;
            feather.replace();

            const endTime = new Date().toISOString();

            try {
                // FIXED: Calculate Absolute Time Diff directly to fix sync issues across midnight/browser hibernation defaults
                const absoluteNow = new Date(endTime).getTime();
                const absoluteStart = new Date(appState.attendance.clockInTime).getTime();
                let hardTotalSeconds = Math.floor((absoluteNow - absoluteStart) / 1000);
                if (hardTotalSeconds > 16 * 3600) {
                    hardTotalSeconds = 8 * 3600; // Cap shift at 8 hours if elapsed > 16 hours
                }

                const outDateObj = new Date(endTime);
                const outHour = parseInt(outDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
                const outMin = parseInt(outDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));
                
                const earlyClockOut = (outHour < 17) || (outHour === 17 && outMin < 45);
                const lateClockOut = (outHour > 18) || (outHour === 18 && outMin >= 15);
                
                let finalStatus = "On Time";
                if (appState.attendance.lateClockIn) {
                    finalStatus = earlyClockOut ? "Late In & Early Out" : "Late Login";
                } else if (earlyClockOut) {
                    finalStatus = "Early Departure";
                } else if (lateClockOut) {
                    finalStatus = "Overtime";
                } else if (appState.attendance.earlyClockIn) {
                    finalStatus = "Early Clock In";
                }

                const attRef = doc(db, "attendance_logs", appState.attendance.activeDocId);
                await updateDoc(attRef, {
                    clockOutTime: endTime,
                    totalSeconds: hardTotalSeconds,
                    status: "Completed",
                    earlyClockOut: earlyClockOut,
                    lateClockOut: lateClockOut,
                    attendanceStatus: finalStatus
                });

                const inDate = new Date(appState.attendance.clockInTime);
                const outDate = new Date(endTime);
                const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                const hours = Math.floor(hardTotalSeconds / 3600);
                const minutes = Math.floor((hardTotalSeconds % 3600) / 60);
                const finalHoursStr = `${hours}h ${minutes}m`;

                appState.attendance.history.unshift({
                    date: inDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat }),
                    in: inDate.toLocaleTimeString('en-GB', timeOpts),
                    out: outDate.toLocaleTimeString('en-GB', timeOpts),
                    total: finalHoursStr,
                    status: 'Completed',
                    statClass: 'status-on-time'
                });

                await notifyClockStatus(CURRENT_USER_ID, appState.profile.name, 'Clocked Out', endTime, finalHoursStr, endTime);

                // Check for attendance issues (e.g. short shift, less than 4 hours = 14400 seconds)
                if (hardTotalSeconds < 14400) {
                    await notifyAttendanceIssue(CURRENT_USER_ID, appState.profile.name, 'Short Shift', `Worked for only ${finalHoursStr} (less than 4 hours).`);
                }

                appState.attendance.isClockedIn = false;
                appState.attendance.clockInTime = null;
                appState.attendance.activeDocId = null;
                appState.attendance.totalSeconds = 0;

                renderAttendanceState();
            } catch (err) {
                console.error("[Firebase] Clock Out Failed: ", err);
                btnClockOut.disabled = false;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }
        });
    }

    // --- LEAVE REQUEST FORM W/ STRICT VALIDATION ---
    const leaveForm = document.getElementById('leaveRequestForm');
    const elStart = document.getElementById('leaveStart');
    const elEnd = document.getElementById('leaveEnd');

    if (elStart && elEnd) {
        const todayStr = new Date().toLocaleDateString('en-CA', gmtFormat);
        elStart.setAttribute('min', todayStr);
        elEnd.setAttribute('min', todayStr);

        elStart.addEventListener('change', () => {
            elEnd.setAttribute('min', elStart.value);
            if (elEnd.value && elEnd.value < elStart.value) {
                elEnd.value = elStart.value;
            }
        });
    }

    if (leaveForm) {
        leaveForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            const lType = document.getElementById('leaveType').value;
            const lStart = elStart.value;
            const lEnd = elEnd.value;
            const lComments = document.querySelector('textarea').value;

            const todayBoundary = new Date().toLocaleDateString('en-CA', gmtFormat);
            if (lStart < todayBoundary || lEnd < todayBoundary) {
                alert("Validation Error: Past dates are not allowed for leave applications.");
                return;
            }
            if (lEnd < lStart) {
                alert("Validation Error: End Date cannot be earlier than Start Date.");
                return;
            }

            // Client-side Leave Balance Availability check
            const typeKey = lType === 'sick' ? 'sick' : (lType === 'festival' ? 'festival' : 'annual');
            const balances = appState.profile.leaveBalance || { annual: 15, sick: 4, festival: 3 };
            const available = balances[typeKey] || 0;
            
            const start = new Date(lStart);
            const end = new Date(lEnd);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            let duration = diffDays;
            if (lType === 'half') {
                duration = 0.5;
            }
            
            if (available < duration) {
                alert(`Insufficient leave balance.\nRequested: ${duration} days\nAvailable: ${available} days`);
                return;
            }

            btn.disabled = true;
            btn.innerHTML = `<i data-feather="loader"></i> Processing Validation...`;
            feather.replace();

            try {
                await addDoc(collection(db, "leave_requests"), {
                    userId: CURRENT_USER_ID,
                    type: lType,
                    startDate: lStart,
                    endDate: lEnd,
                    notes: lComments,
                    status: "Pending",
                    requestDate: new Date().toISOString(),
                    department: appState.profile.department || "Unassigned"
                });

                btn.innerHTML = `<i data-feather="check-circle"></i> Request Submitted`;
                btn.classList.add('btn-success');
                btn.style.boxShadow = "none";
                feather.replace();

                await notifyLeaveRequest(CURRENT_USER_ID, appState.profile.name, lType, lStart, lEnd, lComments);

                setTimeout(() => {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('btn-success');
                    btn.disabled = false;
                    btn.style.boxShadow = "";
                    e.target.reset();
                    feather.replace();
                    navigateTo('#timeoff');
                }, 2000);

            } catch (err) {
                console.error("[Firebase] Error saving leave: ", err);
                btn.innerHTML = `<i data-feather="alert-circle"></i> Service Timeout`;
                setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2000);
            }
        });
    }

    // --- SETTINGS FORM ---
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = `<i data-feather="loader"></i> Saving Data Pipeline...`;
            feather.replace();

            const profilePayload = {
                name: document.getElementById('settingsName').value,
                email: document.getElementById('settingsEmail').value,
                phone: document.getElementById('settingsPhone').value,
                dob: document.getElementById('settingsDob').value,
                gender: document.getElementById('settingsGender').value,
                designation: document.getElementById('settingsDesignation').value,
                department: document.getElementById('settingsDepartment').value,
                avatar: appState.profile.avatar,
                emergencyContact: document.getElementById('settingsEmergencyContact').value,
                joinDate: document.getElementById('settingsJoinDate').value,
                expiryDate: document.getElementById('settingsExpiryDate').value,
                bloodGroup: document.getElementById('settingsBloodGroup').value
            };

            try {
                const userRef = doc(db, "users", CURRENT_USER_ID);
                await updateDoc(userRef, profilePayload);

                appState.profile = { ...appState.profile, ...profilePayload };
                initializeUI();

                btn.innerHTML = `<i data-feather="check"></i> System Profile Updated`;
                btn.classList.add('btn-success');
                feather.replace();

                setTimeout(() => {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('btn-success');
                    btn.disabled = false;
                    feather.replace();
                }, 2000);

            } catch (err) {
                console.error("[Firebase] Profile Update Error: ", err);
                btn.innerHTML = `<i data-feather="alert-circle"></i> Service Timeout`;
                setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2000);
            }
        });

        const profUpload = document.getElementById('profileUpload');
        if (profUpload) {
            profUpload.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        appState.profile.avatar = e.target.result;
                        initializeUI();
                        // Immediate ID Card avatar update
                        const idCardAvatar = document.getElementById('idCardAvatar');
                        if (idCardAvatar) idCardAvatar.src = e.target.result;
                    }
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }
    }

    // --- DIGITAL ID CARD UPDATES & LIVE PREVIEW ---
    function updateIDCard() {
        const idCardName = document.getElementById('idCardName');
        const idCardDesignation = document.getElementById('idCardDesignation');
        const idCardEmpId = document.getElementById('idCardEmpId');
        const idCardDept = document.getElementById('idCardDept');
        const idCardGender = document.getElementById('idCardGender');
        const idCardPhone = document.getElementById('idCardPhone');
        const idCardAvatar = document.getElementById('idCardAvatar');
        const idCardBarcodeText = document.getElementById('idCardBarcodeText');
        const idCardQR = document.getElementById('idCardQR');

        // Back Card Elements
        const idCardJoinDate = document.getElementById('idCardJoinDate');
        const idCardExpiryDate = document.getElementById('idCardExpiryDate');
        const idCardEmergencyContact = document.getElementById('idCardEmergencyContact');
        const idCardSignature = document.getElementById('idCardSignature');
        const idCardBloodGroup = document.getElementById('idCardBloodGroup');

        if (idCardName) idCardName.textContent = appState.profile.name || 'Employee Name';
        if (idCardDesignation) idCardDesignation.textContent = appState.profile.designation || 'Designation';
        if (idCardEmpId) idCardEmpId.textContent = appState.profile.employeeId || 'HM-0000';
        if (idCardDept) idCardDept.textContent = appState.profile.department || 'Unassigned';
        if (idCardGender) {
            const genderLabel = {
                'female': 'Female',
                'male': 'Male',
                'other': 'Other',
                'prefer_not': 'Other'
            }[appState.profile.gender] || appState.profile.gender || 'Other';
            idCardGender.textContent = genderLabel;
        }
        if (idCardPhone) idCardPhone.textContent = appState.profile.phone || '-';
        if (idCardAvatar) idCardAvatar.src = appState.profile.avatar || 'https://ui-avatars.com/api/?name=Employee&background=4F46E5&color=fff';
        if (idCardBarcodeText) idCardBarcodeText.textContent = appState.profile.employeeId || 'HM0000';

        // QR Code API Integration
        if (idCardQR) {
            const qrData = encodeURIComponent(`ID: ${appState.profile.employeeId || 'HM-0000'}\nName: ${appState.profile.name || 'Employee'}\nDept: ${appState.profile.department || 'Unassigned'}\nPhone: ${appState.profile.phone || '-'}`);
            idCardQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;
        }

        // Back Card population
        if (idCardJoinDate) {
            const jd = appState.profile.joinDate;
            idCardJoinDate.textContent = jd ? new Date(jd).toLocaleDateString('en-GB') : '-';
        }
        if (idCardExpiryDate) {
            const ed = appState.profile.expiryDate;
            idCardExpiryDate.textContent = ed ? new Date(ed).toLocaleDateString('en-GB') : '-';
        }
        if (idCardEmergencyContact) idCardEmergencyContact.textContent = appState.profile.emergencyContact || '-';
        if (idCardSignature) idCardSignature.textContent = appState.profile.name || 'Employee Signature';
        if (idCardBloodGroup) idCardBloodGroup.textContent = appState.profile.bloodGroup || '-';
    }

    function bindLiveIDCardPreview() {
        const fields = [
            { id: 'settingsName', targetId: 'idCardName', default: 'Employee Name' },
            { id: 'settingsDesignation', targetId: 'idCardDesignation', default: 'Designation' },
            { id: 'settingsPhone', targetId: 'idCardPhone', default: '-' },
            { id: 'settingsEmergencyContact', targetId: 'idCardEmergencyContact', default: '-' }
        ];

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const target = document.getElementById(f.targetId);
                    if (target) target.textContent = e.target.value || f.default;

                    // Specific extra updates
                    if (f.id === 'settingsName') {
                        const sigTarget = document.getElementById('idCardSignature');
                        if (sigTarget) sigTarget.textContent = e.target.value || f.default;
                    }
                });
            }
        });

        const deptEl = document.getElementById('settingsDepartment');
        if (deptEl) {
            deptEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardDept');
                if (target) target.textContent = e.target.value || 'Unassigned';
            });
        }

        const genderEl = document.getElementById('settingsGender');
        if (genderEl) {
            genderEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardGender');
                if (target) {
                    const val = e.target.value;
                    const genderLabel = {
                        'female': 'Female',
                        'male': 'Male',
                        'other': 'Other',
                        'prefer_not': 'Other'
                    }[val] || val || 'Other';
                    target.textContent = genderLabel;
                }
            });
        }

        const bgEl = document.getElementById('settingsBloodGroup');
        if (bgEl) {
            bgEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardBloodGroup');
                if (target) target.textContent = e.target.value || '-';
            });
        }

        const jdEl = document.getElementById('settingsJoinDate');
        if (jdEl) {
            jdEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardJoinDate');
                if (target) {
                    const val = e.target.value;
                    target.textContent = val ? new Date(val).toLocaleDateString('en-GB') : '-';
                }
            });
        }

        const edEl = document.getElementById('settingsExpiryDate');
        if (edEl) {
            edEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardExpiryDate');
                if (target) {
                    const val = e.target.value;
                    target.textContent = val ? new Date(val).toLocaleDateString('en-GB') : '-';
                }
            });
        }
    }

    bindLiveIDCardPreview();

    // --- ID CARD PREVIEW CONTROLS & EXPORTS ---
    const idCardContainer = document.getElementById('idCardContainer');
    const switcherBtns = document.querySelectorAll('.switcher-btn');

    if (switcherBtns && idCardContainer) {
        switcherBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switcherBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                idCardContainer.classList.remove('preview-front', 'preview-back', 'preview-sheet');
                
                if (btn.id === 'btnShowFront') {
                    idCardContainer.classList.add('preview-front');
                } else if (btn.id === 'btnShowBack') {
                    idCardContainer.classList.add('preview-back');
                } else if (btn.id === 'btnShowSheet') {
                    idCardContainer.classList.add('preview-sheet');
                }
            });
        });
    }

    // PDF Export function
    const btnDownloadPDF = document.getElementById('btnDownloadPDF');
    if (btnDownloadPDF && idCardContainer) {
        btnDownloadPDF.addEventListener('click', async () => {
            const { jsPDF } = window.jspdf;
            const origHTML = btnDownloadPDF.innerHTML;
            btnDownloadPDF.disabled = true;
            btnDownloadPDF.innerHTML = `<i data-feather="loader"></i> Generating PDF...`;
            feather.replace();

            try {
                const idCardFront = document.getElementById('idCardFront');
                const idCardBack = document.getElementById('idCardBack');
                const originalContainerClass = idCardContainer.className;
                
                // Set class to preview-sheet so both cards are rendered correctly in the DOM
                idCardContainer.className = "id-card-container preview-sheet";
                
                // Render front canvas
                const canvasFront = await html2canvas(idCardFront, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgFront = canvasFront.toDataURL('image/png');

                // Render back canvas
                const canvasBack = await html2canvas(idCardBack, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgBack = canvasBack.toDataURL('image/png');
                
                // Restore preview mode class
                idCardContainer.className = originalContainerClass;

                // Create A4 PDF page (210mm x 297mm)
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                // Add header info
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(15, 23, 42); // slate-900
                pdf.text("Homesly stays HRM Employee ID Card", 105, 20, { align: "center" });
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(10);
                pdf.setTextColor(100, 116, 139); // slate-500
                pdf.text("Print-ready high-resolution layout. Standard CR80 Dimensions (54mm x 85.6mm).", 105, 26, { align: "center" });

                // Card Dimensions in mm
                const cardW = 54;
                const cardH = 85.6;
                const startY = 45;
                const frontX = 46;
                const backX = frontX + cardW + 10;

                // Add Front & Back card images
                pdf.addImage(imgFront, 'PNG', frontX, startY, cardW, cardH);
                pdf.addImage(imgBack, 'PNG', backX, startY, cardW, cardH);

                // Add cut boundary dotted lines
                pdf.setDrawColor(203, 213, 225); // slate-300
                pdf.setLineDashPattern([2, 2], 0);
                pdf.rect(frontX, startY, cardW, cardH);
                pdf.rect(backX, startY, cardW, cardH);

                // Footer instructions
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(9);
                pdf.setTextColor(148, 163, 184); // slate-400
                pdf.text("Instructions: Cut along the dotted line, fold in half, and laminate.", 105, startY + cardH + 15, { align: "center" });

                const fileName = `homesly_stays_hrm_id_card_${appState.profile.employeeId || 'HM-0000'}.pdf`;
                pdf.save(fileName);

                btnDownloadPDF.innerHTML = `<i data-feather="check"></i> PDF Downloaded`;
                setTimeout(() => {
                    btnDownloadPDF.innerHTML = origHTML;
                    btnDownloadPDF.disabled = false;
                    feather.replace();
                }, 2000);

            } catch (err) {
                console.error("PDF generation failed:", err);
                alert("PDF generation failed. Please try again.");
                btnDownloadPDF.innerHTML = origHTML;
                btnDownloadPDF.disabled = false;
                feather.replace();
            }
        });
    }

    const btnPrintCard = document.getElementById('btnPrintCard');
    if (btnPrintCard) {
        btnPrintCard.addEventListener('click', () => {
            window.print();
        });
    }

    // --- MOBILE RESPONSIVENESS TOGGLES ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');

    function toggleMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.toggle('open');
            mobileOverlay.classList.toggle('visible');
        }
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMobileMenu);

    // Auto-close sidebar on mobile when a nav link is clicked
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    });

    // --- LEAVE BALANCE RENDER ---
    function renderLeaveBalances() {
        const balAnnual = document.getElementById('balanceAnnual');
        const balSick = document.getElementById('balanceSick');
        const balFestival = document.getElementById('balanceFestival');
        
        const balances = appState.profile.leaveBalance || { annual: 15, sick: 4, festival: 3 };
        
        if (balAnnual) balAnnual.textContent = `${balances.annual} Days`;
        if (balSick) balSick.textContent = `${balances.sick} Days`;
        if (balFestival) balFestival.textContent = `${balances.festival} Days`;
    }

    // --- NOTICE BOARD SYSTEM ---
    function subscribeNotices() {
        const noticesRef = collection(db, "notices");
        onSnapshot(noticesRef, (noticesSnap) => {
            try {
                const now = new Date().toISOString().split('T')[0];
                let activeNotices = [];
                
                noticesSnap.forEach(snap => {
                    const data = snap.data();
                    const isActive = data.active !== false;
                    const isNotExpired = !data.expiryDate || data.expiryDate >= now;
                    if (isActive && isNotExpired) {
                        activeNotices.push({ id: snap.id, ...data });
                    }
                });
                
                activeNotices.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
                
                const container = document.getElementById('noticeBoardContainer');
                if (!container) return;
                
                if (activeNotices.length === 0) {
                    container.innerHTML = `<div style="color: #64748B; text-align: center; padding: 16px 0; width: 100%;">No active notices.</div>`;
                    return;
                }
                
                let noticesHTML = "";
                activeNotices.forEach(notice => {
                    const pubDate = new Date(notice.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    const priorityClass = `notice-priority-${notice.priority || 'normal'}`;
                    const badgeClass = `badge-${notice.priority || 'normal'}`;
                    
                    noticesHTML += `
                        <div class="notice-item ${priorityClass}">
                            <div class="notice-header">
                                <h3 class="notice-title">${notice.title}</h3>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="notice-badge ${badgeClass}">${notice.priority || 'normal'}</span>
                                    <span class="notice-date">${pubDate}</span>
                                </div>
                            </div>
                            <p class="notice-content">${notice.content.replace(/\n/g, '<br>')}</p>
                        </div>
                    `;
                });
                
                container.innerHTML = noticesHTML;
            } catch (err) {
                console.error("Error rendering notices snapshot:", err);
            }
        }, (err) => {
            console.error("Notices listener failed:", err);
        });
    }

    // --- CALENDAR SYSTEM ---
    let calendarCurrentDate = new Date();
    let calendarViewMode = 'month'; // 'month', 'week', 'year'
    let calendarEvents = [];
    let employeeApprovedLeaves = [];
    
    function subscribeCalendarData() {
        const eventsRef = collection(db, "calendar_events");
        onSnapshot(eventsRef, (eventsSnap) => {
            try {
                calendarEvents = [];
                eventsSnap.forEach(snap => {
                    calendarEvents.push({ id: snap.id, ...snap.data() });
                });
                renderCalendar();
            } catch (err) {
                console.error("Error updating calendar events:", err);
            }
        }, (err) => {
            console.error("Calendar events listener failed:", err);
        });
        
        const leavesRef = collection(db, "leave_requests");
        const q = query(leavesRef, where("userId", "==", CURRENT_USER_ID), where("status", "==", "Approved"));
        onSnapshot(q, (leavesSnap) => {
            try {
                employeeApprovedLeaves = [];
                leavesSnap.forEach(snap => {
                    employeeApprovedLeaves.push({ id: snap.id, ...snap.data() });
                });
                renderCalendar();
            } catch (err) {
                console.error("Error updating approved leaves for calendar:", err);
            }
        }, (err) => {
            console.error("Calendar leaves listener failed:", err);
        });
    }
    
    // --- USERS DIRECTORY PIPELINE ---
    function subscribeUsersDirectory() {
        const usersRef = collection(db, "users");
        onSnapshot(usersRef, (snapshot) => {
            try {
                usersMap = {};
                let directoryHTML = `<div class="directory-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; padding: 20px 0;">`;
                
                snapshot.forEach(docSnap => {
                    const emp = { id: docSnap.id, ...docSnap.data() };
                    usersMap[docSnap.id] = emp;
                    
                    if (emp.status !== 'disabled' && emp.role !== 'super_admin') {
                        directoryHTML += `
                            <div class="card employee-card" style="padding: 20px; display: flex; align-items: center; gap: 16px; border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                <img src="${emp.avatar || 'https://ui-avatars.com/api/?name=Employee&background=4F46E5&color=fff'}" alt="${emp.name}" class="avatar-lg" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                                <div>
                                    <h3 style="font-size: 0.95rem; font-weight: 600; color: #1E293B; margin: 0;">${emp.name}</h3>
                                    <p style="font-size: 0.8rem; color: var(--primary); font-weight: 500; margin: 2px 0 4px 0;">${emp.designation || 'Staff'}</p>
                                    <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0; display: flex; align-items: center; gap: 4px;">
                                        <i data-feather="briefcase" style="width: 11px; height: 11px;"></i> ${emp.department || 'Unassigned'}
                                    </p>
                                </div>
                            </div>
                        `;
                    }
                });
                
                directoryHTML += `</div>`;
                const dirBody = document.querySelector('#view-directory .card-body');
                if (dirBody) {
                    dirBody.innerHTML = directoryHTML;
                    feather.replace();
                }
                
                renderCalendar();
            } catch (err) {
                console.error("Error rendering directory grid:", err);
            }
        }, (err) => {
            console.error("Users directory subscription failed:", err);
        });
    }
    
    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthTitle = document.getElementById('calendarMonthTitle');
        if (!grid || !monthTitle) return;
        
        grid.innerHTML = "";
        
        if (calendarViewMode === 'year') {
            renderCalendarYear(grid, monthTitle);
        } else if (calendarViewMode === 'week') {
            renderCalendarWeek(grid, monthTitle);
        } else {
            renderCalendarMonth(grid, monthTitle);
        }
    }

    function renderCalendarMonth(grid, monthTitle) {
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.gap = '8px';

        const year = calendarCurrentDate.getFullYear();
        const month = calendarCurrentDate.getMonth();
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthTitle.textContent = `${monthNames[month]} ${year}`;
        
        const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        dayHeaders.forEach(day => {
            const h = document.createElement('div');
            h.className = "calendar-day-header";
            h.textContent = day;
            grid.appendChild(h);
        });
        
        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = "calendar-day empty";
            grid.appendChild(emptyCell);
        }
        
        const today = new Date();
        for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const cellDate = new Date(year, month, dayNum);
            
            const cell = document.createElement('div');
            cell.className = "calendar-day";
            
            if (year === today.getFullYear() && month === today.getMonth() && dayNum === today.getDate()) {
                cell.classList.add('today');
            }
            
            const numSpan = document.createElement('span');
            numSpan.className = "calendar-day-num";
            numSpan.textContent = dayNum;
            cell.appendChild(numSpan);
            
            const eventsContainer = document.createElement('div');
            eventsContainer.className = "calendar-events-container";
            
            calendarEvents.forEach(evt => {
                if (evt.date === cellDateStr) {
                    const el = document.createElement('div');
                    el.className = `calendar-event event-${evt.type}`;
                    el.textContent = evt.title;
                    el.title = `${evt.title} (${evt.type.replace('_', ' ')})`;
                    eventsContainer.appendChild(el);
                }
            });
            
            employeeApprovedLeaves.forEach(leave => {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                cellDate.setHours(0,0,0,0);
                start.setHours(0,0,0,0);
                end.setHours(0,0,0,0);
                
                if (cellDate >= start && cellDate <= end) {
                    const el = document.createElement('div');
                    el.className = "calendar-event event-leave";
                    el.textContent = "My Leave";
                    el.title = `My Leave: ${leave.startDate} to ${leave.endDate}`;
                    eventsContainer.appendChild(el);
                }
            });
            
            cell.appendChild(eventsContainer);
            grid.appendChild(cell);
        }
    }

    function renderCalendarWeek(grid, monthTitle) {
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.gap = '8px';

        const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        dayHeaders.forEach(day => {
            const h = document.createElement('div');
            h.className = "calendar-day-header";
            h.textContent = day;
            grid.appendChild(h);
        });

        const today = new Date();
        const curr = new Date(calendarCurrentDate);
        const day = curr.getDay();
        const startOfWeek = new Date(curr);
        startOfWeek.setDate(curr.getDate() - day);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startStr = startOfWeek.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
        const endStr = endOfWeek.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        monthTitle.textContent = `Week of ${startStr} - ${endStr}`;

        for (let i = 0; i < 7; i++) {
            const cellDate = new Date(startOfWeek);
            cellDate.setDate(startOfWeek.getDate() + i);

            const y = cellDate.getFullYear();
            const m = cellDate.getMonth();
            const d = cellDate.getDate();

            const cellDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            const cell = document.createElement('div');
            cell.className = "calendar-day";
            cell.style.minHeight = "120px";
            
            if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) {
                cell.classList.add('today');
            }
            
            const numSpan = document.createElement('span');
            numSpan.className = "calendar-day-num";
            numSpan.textContent = d;
            cell.appendChild(numSpan);
            
            const eventsContainer = document.createElement('div');
            eventsContainer.className = "calendar-events-container";
            eventsContainer.style.maxHeight = "90px";
            
            calendarEvents.forEach(evt => {
                if (evt.date === cellDateStr) {
                    const el = document.createElement('div');
                    el.className = `calendar-event event-${evt.type}`;
                    el.textContent = evt.title;
                    el.title = `${evt.title} (${evt.type.replace('_', ' ')})`;
                    eventsContainer.appendChild(el);
                }
            });
            
            employeeApprovedLeaves.forEach(leave => {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                cellDate.setHours(0,0,0,0);
                start.setHours(0,0,0,0);
                end.setHours(0,0,0,0);
                
                if (cellDate >= start && cellDate <= end) {
                    const el = document.createElement('div');
                    el.className = "calendar-event event-leave";
                    el.textContent = "My Leave";
                    el.title = `My Leave: ${leave.startDate} to ${leave.endDate}`;
                    eventsContainer.appendChild(el);
                }
            });
            
            cell.appendChild(eventsContainer);
            grid.appendChild(cell);
        }
    }

    function renderCalendarYear(grid, monthTitle) {
        const year = calendarCurrentDate.getFullYear();
        monthTitle.textContent = `Year ${year}`;
        
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(210px, 1fr))';
        grid.style.gap = '20px';

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const today = new Date();

        for (let m = 0; m < 12; m++) {
            const card = document.createElement('div');
            card.className = "mini-month-card";
            card.style.cssText = "border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; background: white; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);";

            const title = document.createElement('h4');
            title.textContent = monthNames[m];
            title.style.cssText = "font-size: 0.85rem; font-weight: 700; color: #1E293B; margin: 0; text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;";
            card.appendChild(title);

            const miniGrid = document.createElement('div');
            miniGrid.className = "mini-month-grid";
            miniGrid.style.cssText = "display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;";

            const dayHeaders = ["S", "M", "T", "W", "T", "F", "S"];
            dayHeaders.forEach(dh => {
                const headerCell = document.createElement('div');
                headerCell.textContent = dh;
                headerCell.style.cssText = "font-size: 0.6rem; font-weight: 700; color: #94A3B8; text-align: center; padding: 2px 0;";
                miniGrid.appendChild(headerCell);
            });

            const firstDay = new Date(year, m, 1).getDay();
            const totalDays = new Date(year, m + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) {
                const empty = document.createElement('div');
                miniGrid.appendChild(empty);
            }

            for (let d = 1; d <= totalDays; d++) {
                const cellDate = new Date(year, m, d);
                const cellDateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                const dayCell = document.createElement('div');
                dayCell.textContent = d;
                dayCell.style.cssText = "font-size: 0.65rem; font-weight: 600; color: #475569; text-align: center; padding: 3px 0; border-radius: 4px; display: flex; align-items: center; justify-content: center; aspect-ratio: 1; cursor: pointer;";

                if (year === today.getFullYear() && m === today.getMonth() && d === today.getDate()) {
                    dayCell.style.border = "1.5px solid #4F46E5";
                    dayCell.style.color = "#4F46E5";
                }

                let eventType = null;
                let eventTitle = "";
                calendarEvents.forEach(evt => {
                    if (evt.date === cellDateStr) {
                        eventType = evt.type;
                        eventTitle = evt.title;
                    }
                });

                employeeApprovedLeaves.forEach(leave => {
                    const start = new Date(leave.startDate);
                    const end = new Date(leave.endDate);
                    cellDate.setHours(0,0,0,0);
                    start.setHours(0,0,0,0);
                    end.setHours(0,0,0,0);
                    
                    if (cellDate >= start && cellDate <= end) {
                        eventType = "leave";
                        eventTitle = "My Leave";
                    }
                });

                if (eventType) {
                    dayCell.title = eventTitle;
                    if (eventType === 'public_holiday') {
                        dayCell.style.background = "#E0F2FE";
                        dayCell.style.color = "#0369A1";
                    } else if (eventType === 'festival_holiday') {
                        dayCell.style.background = "#F3E8FF";
                        dayCell.style.color = "#6B21A8";
                    } else if (eventType === 'company_holiday') {
                        dayCell.style.background = "#E0E7FF";
                        dayCell.style.color = "#3730A3";
                    } else if (eventType === 'leave') {
                        dayCell.style.background = "#D1FAE5";
                        dayCell.style.color = "#065F46";
                    } else if (eventType === 'team_event') {
                        dayCell.style.background = "#FEF3C7";
                        dayCell.style.color = "#92400E";
                    } else if (eventType === 'important_date') {
                        dayCell.style.background = "#FFE4E6";
                        dayCell.style.color = "#9F1239";
                    }
                }

                miniGrid.appendChild(dayCell);
            }

            card.appendChild(miniGrid);
            grid.appendChild(card);
        }
    }

    const btnPrevMonth = document.getElementById('btnPrevMonth');
    const btnNextMonth = document.getElementById('btnNextMonth');
    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => {
            if (calendarViewMode === 'week') {
                calendarCurrentDate.setDate(calendarCurrentDate.getDate() - 7);
            } else if (calendarViewMode === 'year') {
                calendarCurrentDate.setFullYear(calendarCurrentDate.getFullYear() - 1);
            } else {
                calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
            }
            renderCalendar();
        });
    }
    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => {
            if (calendarViewMode === 'week') {
                calendarCurrentDate.setDate(calendarCurrentDate.getDate() + 7);
            } else if (calendarViewMode === 'year') {
                calendarCurrentDate.setFullYear(calendarCurrentDate.getFullYear() + 1);
            } else {
                calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
            }
            renderCalendar();
        });
    }

    // Switcher bindings
    const calViewSwitcher = document.getElementById('calendarViewSwitcher');
    if (calViewSwitcher) {
        const btns = calViewSwitcher.querySelectorAll('button');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                if (btn.id === 'btnCalendarViewMonth') calendarViewMode = 'month';
                if (btn.id === 'btnCalendarViewWeek') calendarViewMode = 'week';
                if (btn.id === 'btnCalendarViewYear') calendarViewMode = 'year';
                
                renderCalendar();
            });
        });
    }
