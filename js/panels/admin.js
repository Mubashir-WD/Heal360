// js/panels/admin.js
import { db } from '../services/database.js';
import { auth, onAuthStateChanged, signOut } from '../services/auth.js';
import { 
    collection, onSnapshot, doc, getDoc, updateDoc, setDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAQnSbWBx3R1zciZ4-bv62NS5KC312EotI",
    authDomain: "homesly-stays-group.firebaseapp.com",
    projectId: "homesly-stays-group",
    storageBucket: "homesly-stays-group.firebasestorage.app",
    messagingSenderId: "736880412086",
    appId: "1:736880412086:web:2f3fbf17ea1394d863ed17",
    measurementId: "G-K97L3LB1XJ"
};

const secondaryApp = initializeApp(firebaseConfig, "secondaryApp");
const secondaryAuth = getAuth(secondaryApp);

// DOMContentLoaded wrapper removed for direct module execution

    let CURRENT_ADMIN_ID = null;
    let adminProfile = null;
    let usersMap = {};
    let departmentsList = [];
    let attendanceLogs = [];
    let leaveRequests = [];

    const gmtFormat = { timeZone: 'Europe/London' };

    // --- SECURITY GATEWAY & PROFILE FETCH ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!CURRENT_ADMIN_ID) {
                CURRENT_ADMIN_ID = user.uid;
                
                // Fetch the logged-in admin's profile
                try {
                    const adminRef = doc(db, "users", CURRENT_ADMIN_ID);
                    const adminSnap = await getDoc(adminRef);
                    if (adminSnap.exists()) {
                        adminProfile = { id: CURRENT_ADMIN_ID, ...adminSnap.data() };
                        
                        // Check if disabled
                        if (adminProfile.status === 'disabled') {
                            alert("Your account has been disabled. Please contact your administrator.");
                            await signOut(auth);
                            window.location.replace("login.html");
                            return;
                        }
                    } else {
                        // Safe fallback profile
                        adminProfile = {
                            id: CURRENT_ADMIN_ID,
                            name: "HR Admin",
                            role: "hr_admin",
                            department: "HR"
                        };
                    }

                    // Direct standard employees away from Admin panel
                    if (adminProfile.role === 'employee') {
                        window.location.replace("index.html");
                        return;
                    }

                    initializeAdminUI();
                    initializeAdminSettings();
                    triggerRealTimeHRDataPipeline();
                } catch (e) {
                    console.error("Auth security gate error:", e);
                    window.location.replace("login.html");
                }
            }
        } else {
            window.location.replace("login.html");
        }
    });

    const logoutBtn = document.createElement('a');
    Object.assign(logoutBtn, {
        href: "#logout", className: "nav-item nav-link",
        innerHTML: `<i data-feather="log-out"></i> End Session`
    });
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth);
    });
    document.querySelector('.nav-menu').appendChild(logoutBtn);


    // --- SPA ROUTING ---
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitleText = document.getElementById('pageTitleText');

    function navigateTo(hash) {
        if (!hash || hash === '') hash = '#admin-dashboard';
        viewSections.forEach(sec => sec.style.display = 'none');
        navLinks.forEach(nav => nav.classList.remove('active'));

        let targetNav = document.querySelector(`.nav-link[href="${hash}"]`);
        if (!targetNav) { 
            targetNav = document.querySelector('.nav-link[href="#admin-dashboard"]'); 
            hash = '#admin-dashboard'; 
        }

        if (targetNav) {
            const targetViewId = targetNav.getAttribute('data-target');
            const targetView = document.getElementById(targetViewId);
            if (targetView) targetView.style.display = 'block';
            targetNav.classList.add('active');

            const titleMap = {
                '#admin-dashboard': 'Employee Attendance Monitoring',
                '#admin-leaves': 'Leave Management Workflow',
                '#admin-employees': 'Employee Directory & Roles',
                '#admin-departments': 'Department Management',
                '#admin-notices': 'Company Announcement Board',
                '#admin-calendar': 'Annual Event Calendar',
                '#admin-settings': 'Account Settings'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'HR Portal';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));


    // --- DATE DISPLAY ---
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';


    // --- ADMIN UI DYNAMICS ---
    function initializeAdminUI() {
        const nameEl = document.querySelector('.user-profile .user-name');
        const roleEl = document.querySelector('.user-profile .user-role');
        const avatarEl = document.querySelector('.user-profile .avatar');

        if (nameEl && adminProfile) nameEl.textContent = adminProfile.name || 'HR Administrator';
        if (roleEl && adminProfile) {
            const roleLabels = {
                'team_lead': 'Team Lead / Dept Admin',
                'hr_admin': 'HR Administrator',
                'super_admin': 'Super Administrator'
            };
            roleEl.textContent = roleLabels[adminProfile.role] || adminProfile.role || 'HR Admin';
        }
        if (avatarEl && adminProfile && adminProfile.avatar) {
            avatarEl.src = adminProfile.avatar;
        }

        // Hide Departments tab for Team Leads
        if (adminProfile && adminProfile.role === 'team_lead') {
            const deptLink = document.querySelector('a[href="#admin-departments"]');
            if (deptLink) deptLink.style.display = 'none';
        }

        // Hide Employee Portal link for Super Admin (CEO)
        if (adminProfile && adminProfile.role === 'super_admin') {
            const employeePortalLink = document.querySelector('a[href="index.html"]');
            if (employeePortalLink) employeePortalLink.style.display = 'none';
        }
    }


    // --- HR MONITORING ENGINE (REAL-TIME SNAPSHOT CORE) ---
    let isPipelineInitialized = false;

    function triggerRealTimeHRDataPipeline() {
        if (isPipelineInitialized) return;
        isPipelineInitialized = true;
        console.log("[HR Admin] Binding real-time websocket pipelines to Firebase...");

        // 1. LIVE USERS SNAPSHOT
        onSnapshot(collection(db, "users"), (snapshot) => {
            snapshot.forEach(docSnap => {
                usersMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            });
            renderAttendance();
            renderLeaves();
            renderEmployees();
        }, (err) => {
            console.error("[HR Realtime] Users sync error:", err);
        });

        // 2. LIVE DEPARTMENTS SNAPSHOT
        onSnapshot(collection(db, "departments"), (snapshot) => {
            departmentsList = [];
            snapshot.forEach(docSnap => {
                departmentsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            departmentsList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            renderDepartments();
        }, (err) => {
            console.error("[HR Realtime] Departments sync error:", err);
        });

        // 3. LIVE ATTENDANCE SNAPSHOT
        onSnapshot(collection(db, "attendance_logs"), (querySnapshot) => {
            attendanceLogs = [];
            querySnapshot.forEach(snap => {
                attendanceLogs.push({ id: snap.id, ...snap.data() });
            });
            attendanceLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));
            renderAttendance();
        }, (err) => {
            console.error("[HR Realtime] Attendance sync error:", err);
        });

        // 4. LIVE LEAVES SNAPSHOT
        onSnapshot(collection(db, "leave_requests"), (querySnapshot) => {
            leaveRequests = [];
            querySnapshot.forEach(snap => {
                leaveRequests.push({ id: snap.id, ...snap.data() });
            });
            leaveRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
            renderLeaves();
            renderAdminCalendar();
        }, (err) => {
            console.error("[HR Realtime] Leaves sync error:", err);
        });

        // 5. LIVE NOTICES SNAPSHOT
        onSnapshot(collection(db, "notices"), (snapshot) => {
            noticesList = [];
            snapshot.forEach(docSnap => {
                noticesList.push({ id: docSnap.id, ...docSnap.data() });
            });
            noticesList.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
            renderAdminNotices();
        }, (err) => {
            console.error("[HR Realtime] Notices sync error:", err);
        });

        // 6. LIVE CALENDAR EVENTS SNAPSHOT
        onSnapshot(collection(db, "calendar_events"), (snapshot) => {
            calendarEventsList = [];
            snapshot.forEach(docSnap => {
                calendarEventsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            calendarEventsList.sort((a, b) => new Date(a.date) - new Date(b.date));
            renderAdminCalendarEventsTable();
            renderAdminCalendar();
        }, (err) => {
            console.error("[HR Realtime] Calendar events sync error:", err);
        });
    }

    // --- RENDERING PIPELINES ---

    function renderAttendance() {
        const tableBody = document.getElementById('globalAttendanceTable');
        if (!tableBody) return;

        let metricActiveShiftsCount = 0;
        let metricLateCount = 0;
        let tableHTML = "";

        const filteredLogs = attendanceLogs.filter(log => {
            const emp = usersMap[log.userId];
            if (!emp) return false;
            // Exclude super admins from normal employee structures
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead') {
                const isReportingManager = emp.reportingManager === adminProfile.id;
                const isSameDepartment = emp.department === adminProfile.department;
                if (!isReportingManager && !isSameDepartment) {
                    return false;
                }
            }
            return true;
        });

        for (const log of filteredLogs) {
            const emp = usersMap[log.userId] || { name: "Unknown", designation: "-", department: "N/A" };
            const empName = emp.name;

            const inDateObj = new Date(log.clockInTime);
            const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

            const rawDateStr = inDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
            const inTimeStr = inDateObj.toLocaleTimeString('en-GB', timeOpts);

            let outTimeStr = "--:--";
            let totalHoursStr = '<span style="color:#2563EB"><i data-feather="loader" style="width:12px"></i> Active</span>';
            let statusBadge = '<span class="status-pill status-active">Active Shift</span>';

            const loginHour = parseInt(inDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
            const loginMin = parseInt(inDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));

            let isLate = (loginHour > 9) || (loginHour === 9 && loginMin >= 15);

            let badgeHTML = `<div class="attendance-badges-list">`;
            if (log.lateClockIn) badgeHTML += `<span class="attendance-badge badge-late-in">Late In</span>`;
            if (log.earlyClockIn) badgeHTML += `<span class="attendance-badge badge-early-in">Early In</span>`;
            if (log.earlyClockOut) badgeHTML += `<span class="attendance-badge badge-early-out">Early Out</span>`;
            if (log.lateClockOut) badgeHTML += `<span class="attendance-badge badge-late-out">Late Out</span>`;
            badgeHTML += `</div>`;
            
            const statusVal = log.attendanceStatus || (isLate ? "Late Login" : "Logged Out");
            let statusClass = "status-on-time";
            if (statusVal === "Late Login" || statusVal === "Early Departure" || statusVal === "Late In & Early Out") {
                statusClass = "status-late";
            }
            
            if (log.clockOutTime === null) {
                metricActiveShiftsCount++;
                statusBadge = isLate
                    ? '<span class="status-pill status-late">Active (Late)</span>'
                    : '<span class="status-pill status-active">Active Shift</span>';
            } else {
                statusBadge = `<span class="status-pill ${statusClass}">${statusVal}</span>`;
            }

            const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
            if (isLate && rawDateStr === todayStr && log.clockOutTime === null) {
                metricLateCount++;
            }

            tableHTML += `<tr>
                <td>
                    <strong>${empName}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">${emp.designation} (${emp.department || 'Unassigned'})</div>
                </td>
                <td>${rawDateStr}</td>
                <td>${inTimeStr}</td>
                <td>${outTimeStr}</td>
                <td><strong>${totalHoursStr}</strong></td>
                <td>
                    ${statusBadge}
                    ${badgeHTML}
                </td>
            </tr>`;
        }

        if (filteredLogs.length === 0) {
            tableHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0; color: #64748B;">No tracking data flowing in department yet.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        document.getElementById('metricActiveShifts').textContent = metricActiveShiftsCount;
        document.getElementById('metricLateLogins').textContent = metricLateCount;
    }

    function renderLeaves() {
        const leaveTableBody = document.getElementById('globalLeavesTable');
        if (!leaveTableBody) return;

        let metricPendingLeavesCount = 0;
        let leaveHTML = "";

        const filteredLeaves = leaveRequests.filter(req => {
            const emp = usersMap[req.userId];
            if (!emp) return false;
            // Exclude super admins from leave requests list
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead') {
                const isReportingManager = emp.reportingManager === adminProfile.id;
                const isSameDepartment = emp.department === adminProfile.department;
                if (!isReportingManager && !isSameDepartment) {
                    return false;
                }
            }
            return true;
        });

        for (const request of filteredLeaves) {
            if (request.status === "Pending") metricPendingLeavesCount++;

            const emp = usersMap[request.userId] || { name: "Unknown" };
            const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave', 'festival': 'Festival Leave' };
            const formattedType = typeMap[request.type] || request.type;

            const reqDateFormatted = new Date(request.requestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...gmtFormat });

            let actionHTML = "";
            if (request.status === "Pending") {
                actionHTML = `
                    <button class="btn-action btn-approve" data-id="${request.id}"><i data-feather="check" style="width:14px; margin-right:4px;"></i> Approve</button>
                    <button class="btn-action btn-reject" data-id="${request.id}" style="margin-left: 8px;"><i data-feather="x" style="width:14px; margin-right:4px;"></i> Reject</button>
                `;
            } else if (request.status === "Approved" || request.status === "Approve") {
                actionHTML = `<span style="color:#166534; font-weight:700; font-size:0.8rem;"><i data-feather="check" style="width:14px;"></i> Approved</span>`;
            } else {
                actionHTML = `<span style="color:#991B1B; font-weight:700; font-size:0.8rem;"><i data-feather="x" style="width:14px;"></i> Rejected</span>`;
            }

            let notesAndRemarks = `Notes: ${request.notes || 'None'}`;
            if (request.remarks) {
                notesAndRemarks += `<div style="font-size:0.75rem; color:#4F46E5; margin-top:2px;"><strong>Remarks:</strong> ${request.remarks} ${request.approvedBy ? `(by ${request.approvedBy})` : ''}</div>`;
            }

            leaveHTML += `<tr>
                <td>
                    <strong>${emp.name}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">${notesAndRemarks}</div>
                </td>
                <td>${formattedType}</td>
                <td>${request.startDate}</td>
                <td>${request.endDate}</td>
                <td>${reqDateFormatted}</td>
                <td id="td-${request.id}">${actionHTML}</td>
            </tr>`;
        }

        if (filteredLeaves.length === 0) {
            leaveHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0;">No leave requests on department queue.</td></tr>`;
        }

        leaveTableBody.innerHTML = leaveHTML;
        feather.replace();
        bindLeaveActions();

        document.getElementById('metricPendingLeaves').textContent = metricPendingLeavesCount;
    }

    function bindLeaveActions() {
        const approveBtns = document.querySelectorAll('.btn-approve');
        const rejectBtns = document.querySelectorAll('.btn-reject');

        approveBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.btn-approve');
                const docId = targetBtn.getAttribute('data-id');
                openLeaveRemarksModal(docId, "Approved");
            });
        });

        rejectBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.btn-reject');
                const docId = targetBtn.getAttribute('data-id');
                openLeaveRemarksModal(docId, "Rejected");
            });
        });
    }

    function openLeaveRemarksModal(docId, action) {
        document.getElementById('leaveRemarksDocId').value = docId;
        document.getElementById('leaveRemarksAction').value = action;
        document.getElementById('leaveRemarksText').value = "";
        document.getElementById('leaveRemarksModalTitle').textContent = action === "Approved" ? "Approve Leave Request" : "Reject Leave Request";
        document.getElementById('leaveRemarksModal').style.display = 'flex';
    }

    function renderEmployees() {
        const tableBody = document.getElementById('globalEmployeesTable');
        if (!tableBody) return;

        let tableHTML = "";
        const employees = Object.values(usersMap).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const filteredEmployees = employees.filter(emp => {
            // Exclude super admins from employee listings
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead') {
                const isReportingManager = emp.reportingManager === adminProfile.id;
                const isSameDepartment = emp.department === adminProfile.department;
                if (!isReportingManager && !isSameDepartment) {
                    return false;
                }
            }
            return true;
        });

        for (const emp of filteredEmployees) {
            const mgrName = emp.reportingManager && usersMap[emp.reportingManager] 
                ? usersMap[emp.reportingManager].name 
                : "<span style='color:#94A3B8'>None (Top Level)</span>";

            const roleLabels = {
                'employee': 'Employee',
                'team_lead': 'Team Lead / Dept Admin',
                'hr_admin': 'HR Admin',
                'super_admin': 'Super Admin'
            };
            const roleLabel = roleLabels[emp.role] || emp.role || 'Employee';

            let actionsHTML = "";
            if (adminProfile.role === 'super_admin' || adminProfile.role === 'hr_admin' || adminProfile.role === 'hr') {
                const statusBtnText = emp.status === 'disabled' ? 'Enable' : 'Disable';
                const statusBtnClass = emp.status === 'disabled' ? 'btn-success' : 'btn-danger';
                actionsHTML = `
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-view-id-emp" data-id="${emp.id}" title="View Digital ID Card"><i data-feather="credit-card" style="width:12px;"></i> ID Card</button>
                        <button class="btn btn-secondary btn-sm btn-edit-emp" data-id="${emp.id}"><i data-feather="edit-2" style="width:12px;"></i> Edit</button>
                        <button class="btn btn-secondary btn-sm btn-reset-pw-emp" data-id="${emp.id}" data-email="${emp.email}" title="Send Password Reset Email"><i data-feather="key" style="width:12px;"></i> Reset PW</button>
                        <button class="btn btn-sm btn-toggle-status-emp ${statusBtnClass}" data-id="${emp.id}" data-status="${emp.status || 'active'}" style="padding: 6px 12px; font-size: 0.8rem;">${statusBtnText}</button>
                    </div>
                `;
            } else {
                actionsHTML = `<span style="color:#94A3B8; font-size:0.8rem;">No Actions</span>`;
            }

            tableHTML += `<tr>
                <td>
                    <strong>${emp.name || 'Unnamed'}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">${emp.email}</div>
                    ${emp.employeeId ? `<div style="font-size: 0.75rem; color: var(--primary); font-weight:600; margin-top:2px;">ID: ${emp.employeeId}</div>` : ''}
                </td>
                <td>${emp.department || "<span style='color:#94A3B8'>Unassigned</span>"}</td>
                <td>
                    <span class="status-pill status-on-time">${roleLabel}</span>
                    ${emp.status === 'disabled' ? '<br><span class="status-pill" style="background:#E2E8F0; color:#64748B; font-size:0.65rem; padding:2px 8px; margin-top:4px; display:inline-block;">Disabled</span>' : ''}
                </td>
                <td>${mgrName}</td>
                <td>${actionsHTML}</td>
            </tr>`;
        }

        if (filteredEmployees.length === 0) {
            tableHTML = `<tr><td colspan="5" style="text-align:center; padding: 32px 0; color: #64748B;">No employees registered.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        // Bind View ID Card clicks
        const viewIdCardBtns = document.querySelectorAll('.btn-view-id-emp');
        viewIdCardBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const empId = e.currentTarget.getAttribute('data-id');
                openViewIdCardModal(empId);
            });
        });

        // Bind Edit clicks
        const editBtns = document.querySelectorAll('.btn-edit-emp');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const empId = e.currentTarget.getAttribute('data-id');
                openEditEmployeeModal(empId);
            });
        });

        // Bind Reset Password clicks
        const resetPwBtns = document.querySelectorAll('.btn-reset-pw-emp');
        resetPwBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                if (confirm(`Send a password reset email to ${email}?`)) {
                    try {
                        await sendPasswordResetEmail(auth, email);
                        alert(`Password reset email has been sent to ${email}.`);
                    } catch (err) {
                        console.error("Reset password error:", err);
                        alert("Failed to send reset email: " + err.message);
                    }
                }
            });
        });

        // Bind Toggle Status clicks
        const toggleStatusBtns = document.querySelectorAll('.btn-toggle-status-emp');
        toggleStatusBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const empId = e.currentTarget.getAttribute('data-id');
                const currentStatus = e.currentTarget.getAttribute('data-status');
                const nextStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
                
                if (confirm(`Are you sure you want to ${nextStatus === 'disabled' ? 'disable' : 'enable'} this employee account?`)) {
                    try {
                        await updateDoc(doc(db, "users", empId), { status: nextStatus });
                        console.log(`Employee status toggled to: ${nextStatus}`);
                    } catch (err) {
                        console.error("Toggle status error:", err);
                        alert("Database update failed: " + err.message);
                    }
                }
            });
        });
    }

    function renderDepartments() {
        const tableBody = document.getElementById('globalDepartmentsTable');
        if (!tableBody) return;

        let tableHTML = "";

        departmentsList.forEach(dept => {
            const createdDate = dept.createdAt 
                ? new Date(dept.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat })
                : "N/A";

            let actionsHTML = "";
            if (adminProfile.role === 'super_admin' || adminProfile.role === 'hr_admin' || adminProfile.role === 'hr') {
                actionsHTML = `<button class="btn btn-secondary btn-sm btn-delete-dept" data-id="${dept.id}" style="background:#FEE2E2; color:#991B1B; border-color:#FECACA;"><i data-feather="trash" style="width:12px;"></i> Delete</button>`;
            } else {
                actionsHTML = `<span style="color:#94A3B8; font-size:0.8rem;">No Actions</span>`;
            }

            tableHTML += `<tr>
                <td><strong>${dept.name}</strong></td>
                <td>${createdDate}</td>
                <td>${actionsHTML}</td>
            </tr>`;
        });

        if (departmentsList.length === 0) {
            tableHTML = `<tr><td colspan="3" style="text-align:center; padding: 32px 0; color: #64748B;">No departments configured.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        // Bind Delete clicks
        const deleteBtns = document.querySelectorAll('.btn-delete-dept');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deptId = e.currentTarget.getAttribute('data-id');
                deleteDepartment(deptId);
            });
        });
    }


    // --- DIALOG MODAL & FORM WRITING ACTIONS ---

    function openEditEmployeeModal(empId) {
        const emp = usersMap[empId];
        if (!emp) return;

        document.getElementById('editEmpId').value = empId;
        document.getElementById('editEmpRole').value = emp.role || 'employee';
        document.getElementById('editEmpName').value = emp.name || '';
        document.getElementById('editEmpNumber').value = emp.employeeId || '';
        document.getElementById('editEmpDesignation').value = emp.designation || '';
        document.getElementById('editEmpStatus').value = emp.status || 'active';
        document.getElementById('editEmpGender').value = emp.gender || 'other';
        document.getElementById('editEmpPhone').value = emp.phone || '';

        const deptSelect = document.getElementById('editEmpDept');
        deptSelect.innerHTML = `<option value="">Select Department</option>`;
        departmentsList.forEach(dept => {
            const selected = emp.department === dept.name ? "selected" : "";
            deptSelect.innerHTML += `<option value="${dept.name}" ${selected}>${dept.name}</option>`;
        });

        const managerSelect = document.getElementById('editEmpManager');
        managerSelect.innerHTML = `<option value="">Select Manager</option>`;
        Object.values(usersMap).forEach(user => {
            if (user.id !== empId && user.role && user.role !== 'employee') {
                const selected = emp.reportingManager === user.id ? "selected" : "";
                managerSelect.innerHTML += `<option value="${user.id}" ${selected}>${user.name}</option>`;
            }
        });

        document.getElementById('editEmployeeModal').style.display = 'flex';
    }

    const editEmployeeForm = document.getElementById('editEmployeeForm');
    if (editEmployeeForm) {
        editEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const empId = document.getElementById('editEmpId').value;
            const name = document.getElementById('editEmpName').value;
            const employeeId = document.getElementById('editEmpNumber').value;
            const designation = document.getElementById('editEmpDesignation').value;
            const status = document.getElementById('editEmpStatus').value;
            const gender = document.getElementById('editEmpGender').value;
            const phone = document.getElementById('editEmpPhone').value;
            const role = document.getElementById('editEmpRole').value;
            const department = document.getElementById('editEmpDept').value;
            const reportingManager = document.getElementById('editEmpManager').value;

            try {
                await updateDoc(doc(db, "users", empId), {
                    name: name,
                    employeeId: employeeId,
                    designation: designation,
                    status: status,
                    gender: gender,
                    phone: phone,
                    role: role,
                    department: department,
                    reportingManager: reportingManager
                });
                document.getElementById('editEmployeeModal').style.display = 'none';
                console.log(`[Firestore] Employee ${empId} configuration saved.`);
            } catch (err) {
                console.error("Error updating employee profile:", err);
                alert("Database update rejected.");
            }
        });
    }

    // --- ADD EMPLOYEE CREATION IMPLEMENTATION ---

    function openAddEmployeeModal() {
        const deptSelect = document.getElementById('addEmpDept');
        deptSelect.innerHTML = `<option value="">Select Department</option>`;
        departmentsList.forEach(dept => {
            deptSelect.innerHTML += `<option value="${dept.name}">${dept.name}</option>`;
        });

        const managerSelect = document.getElementById('addEmpManager');
        managerSelect.innerHTML = `<option value="">Select Manager</option>`;
        Object.values(usersMap).forEach(user => {
            if (user.role && user.role !== 'employee') {
                managerSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
            }
        });

        // Set default temporary password
        document.getElementById('addEmpPassword').value = 'Homesly@2026';
        
        // Generate random employee ID
        document.getElementById('addEmpNumber').value = 'HM-' + Math.floor(1000 + Math.random() * 9000);

        document.getElementById('addEmployeeModal').style.display = 'flex';
    }

    const addEmpBtn = document.getElementById('addEmployeeBtn');
    if (addEmpBtn) {
        addEmpBtn.addEventListener('click', openAddEmployeeModal);
    }

    const addEmployeeForm = document.getElementById('addEmployeeForm');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('addEmpSubmitBtn');
            const origText = submitBtn.textContent;
            
            const name = document.getElementById('addEmpName').value;
            const email = document.getElementById('addEmpEmail').value;
            const password = document.getElementById('addEmpPassword').value;
            const employeeId = document.getElementById('addEmpNumber').value;
            const designation = document.getElementById('addEmpDesignation').value;
            const phone = document.getElementById('addEmpPhone').value;
            const gender = document.getElementById('addEmpGender').value;
            const status = document.getElementById('addEmpStatus').value;
            const role = document.getElementById('addEmpRole').value;
            const department = document.getElementById('addEmpDept').value;
            const reportingManager = document.getElementById('addEmpManager').value;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            try {
                // 1. Create user in secondary Auth instance
                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const newUid = userCred.user.uid;

                // 2. Immediately sign out from secondary Auth instance to prevent session hijack
                await secondarySignOut(secondaryAuth);

                // 3. Write user details to Firestore
                await setDoc(doc(db, "users", newUid), {
                    name: name,
                    email: email,
                    employeeId: employeeId,
                    designation: designation,
                    phone: phone,
                    gender: gender,
                    status: status,
                    role: role,
                    department: department,
                    reportingManager: reportingManager,
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4F46E5&color=fff`,
                    createdAt: new Date().toISOString(),
                    leaveBalance: { annual: 15, sick: 4, festival: 3 }
                });

                document.getElementById('addEmployeeModal').style.display = 'none';
                addEmployeeForm.reset();
                alert(`Employee account created successfully!\n\nEmail: ${email}\nPassword: ${password}`);
            } catch (err) {
                console.error("Error creating employee account:", err);
                alert("Account creation failed: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = origText;
            }
        });
    }

    // --- DEPARTMENT MANAGEMENT CRUD IMPLEMENTATION ---

    async function deleteDepartment(deptId) {
        if (confirm(`Delete the department: '${deptId}'? This does not alter assigned employees; they must be reassigned manually.`)) {
            try {
                await deleteDoc(doc(db, "departments", deptId));
                console.log(`[Firestore] Department ${deptId} deleted.`);
            } catch (e) {
                console.error("Error deleting department:", e);
                alert("Database write error.");
            }
        }
    }

    async function addDepartment() {
        const name = prompt("Enter the name of the new department/team:");
        if (!name) return;
        
        const deptId = name.trim().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        if (!deptId) {
            alert("Invalid department identifier structure.");
            return;
        }

        try {
            const dRef = doc(db, "departments", deptId);
            const dSnap = await getDoc(dRef);
            if (dSnap.exists()) {
                alert("A department with this name already exists.");
                return;
            }
            await setDoc(dRef, {
                name: name.trim(),
                createdAt: new Date().toISOString()
            });
            console.log(`[Firestore] Department '${name}' successfully configured.`);
        } catch (e) {
            console.error("Error saving department:", e);
            alert("Database write validation failure.");
        }
    }

    const addDeptBtn = document.getElementById('addDepartmentBtn');
    if (addDeptBtn) {
        addDeptBtn.addEventListener('click', addDepartment);
    }

    // --- MOBILE MENU RESPONSIVENESS ---
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

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    });

    // --- LEAVE REMARKS FORM SUBMISSION ---
    const leaveRemarksForm = document.getElementById('leaveRemarksForm');
    if (leaveRemarksForm) {
        leaveRemarksForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('leaveRemarksSubmitBtn');
            const origText = submitBtn.textContent;
            
            const docId = document.getElementById('leaveRemarksDocId').value;
            const action = document.getElementById('leaveRemarksAction').value;
            const remarksText = document.getElementById('leaveRemarksText').value;
            
            submitBtn.disabled = true;
            submitBtn.textContent = "Processing...";
            
            try {
                const req = leaveRequests.find(r => r.id === docId);
                
                if (action === "Approved" && req && !req.balanceDeducted) {
                    const start = new Date(req.startDate);
                    const end = new Date(req.endDate);
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    let duration = diffDays;
                    if (req.type === 'half') {
                        duration = 0.5;
                    }
                    
                    const empRef = doc(db, "users", req.userId);
                    const empSnap = await getDoc(empRef);
                    if (empSnap.exists()) {
                        const empData = empSnap.data();
                        const currentBalance = empData.leaveBalance || { annual: 15, sick: 4, festival: 3 };
                        const typeKey = req.type === 'sick' ? 'sick' : (req.type === 'festival' ? 'festival' : 'annual');
                        
                        const available = currentBalance[typeKey] || 0;
                        if (available < duration) {
                            alert(`Approval rejected: Employee has insufficient leave balance.\nRequested: ${duration} days\nAvailable: ${available} days`);
                            submitBtn.disabled = false;
                            submitBtn.textContent = origText;
                            return;
                        }
                        
                        const newBalance = {
                            ...currentBalance,
                            [typeKey]: Math.max(0, (currentBalance[typeKey] || 0) - duration)
                        };
                        
                        await updateDoc(empRef, { leaveBalance: newBalance });
                        console.log(`[Leave Balance] Deducted ${duration} days from ${req.userId}'s ${typeKey} leave balance.`);
                    }
                }
                
                await updateDoc(doc(db, "leave_requests", docId), {
                    status: action,
                    remarks: remarksText || "",
                    approvedBy: adminProfile.name || "Admin",
                    balanceDeducted: action === "Approved" ? true : false,
                    approvalDate: new Date().toISOString()
                });
                
                document.getElementById('leaveRemarksModal').style.display = 'none';
                console.log(`[Leave Approval] Request ${docId} set to ${action}.`);
            } catch (err) {
                console.error("Error processing leave approval remarks:", err);
                alert("Action failed: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = origText;
            }
        });
    }

    // --- VIEW EMPLOYEE ID CARD MODAL ---
    let selectedEmployeeForID = null;

    function openViewIdCardModal(empId) {
        const emp = usersMap[empId];
        if (!emp) return;
        selectedEmployeeForID = emp;

        document.getElementById('adminIdCardName').textContent = emp.name || 'Employee Name';
        document.getElementById('adminIdCardDesignation').textContent = emp.designation || 'Designation';
        document.getElementById('adminIdCardEmpId').textContent = emp.employeeId || 'HM-0000';
        document.getElementById('adminIdCardDept').textContent = emp.department || 'Unassigned';
        document.getElementById('adminIdCardPhone').textContent = emp.phone || '-';
        document.getElementById('adminIdCardBloodGroup').textContent = emp.bloodGroup || '-';
        document.getElementById('adminIdCardAvatar').src = emp.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=4F46E5&color=fff`;
        document.getElementById('adminIdCardBarcodeText').textContent = emp.employeeId || 'HM0000';

        const genderLabel = {
            'female': 'Female',
            'male': 'Male',
            'other': 'Other',
            'prefer_not': 'Other'
        }[emp.gender] || emp.gender || 'Other';
        document.getElementById('adminIdCardGender').textContent = genderLabel;

        const qrData = encodeURIComponent(`ID: ${emp.employeeId || 'HM-0000'}\nName: ${emp.name || 'Employee'}\nDept: ${emp.department || 'Unassigned'}\nPhone: ${emp.phone || '-'}`);
        document.getElementById('adminIdCardQR').src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;

        const jd = emp.joinDate || emp.createdAt;
        document.getElementById('adminIdCardJoinDate').textContent = jd ? new Date(jd).toLocaleDateString('en-GB') : '-';
        
        let ed = emp.expiryDate;
        if (!ed && jd) {
            const jdObj = new Date(jd);
            ed = new Date(jdObj.setFullYear(jdObj.getFullYear() + 5)).toISOString();
        }
        document.getElementById('adminIdCardExpiryDate').textContent = ed ? new Date(ed).toLocaleDateString('en-GB') : '-';
        document.getElementById('adminIdCardEmergencyContact').textContent = emp.emergencyContact || '-';
        document.getElementById('adminIdCardSignature').textContent = emp.name || 'Employee Signature';

        const container = document.getElementById('adminIdCardContainer');
        container.className = "id-card-container preview-front";
        document.querySelectorAll('.id-card-switcher button').forEach(b => {
            if (b.id === 'adminBtnShowFront' || b.id === 'adminBtnShowBack' || b.id === 'adminBtnShowSheet') {
                b.classList.remove('active');
            }
        });
        document.getElementById('adminBtnShowFront').classList.add('active');

        document.getElementById('viewIdCardModal').style.display = 'flex';
        feather.replace();
    }

    const adminIdCardContainer = document.getElementById('adminIdCardContainer');
    const adminSwitcherBtns = document.querySelectorAll('.id-card-switcher button');
    if (adminSwitcherBtns && adminIdCardContainer) {
        adminSwitcherBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.id === 'adminBtnShowFront' || btn.id === 'adminBtnShowBack' || btn.id === 'adminBtnShowSheet') {
                    adminSwitcherBtns.forEach(b => {
                        if (b.id === 'adminBtnShowFront' || b.id === 'adminBtnShowBack' || b.id === 'adminBtnShowSheet') {
                            b.classList.remove('active');
                        }
                    });
                    btn.classList.add('active');
                    adminIdCardContainer.className = "id-card-container";
                    if (btn.id === 'adminBtnShowFront') adminIdCardContainer.classList.add('preview-front');
                    if (btn.id === 'adminBtnShowBack') adminIdCardContainer.classList.add('preview-back');
                    if (btn.id === 'adminBtnShowSheet') adminIdCardContainer.classList.add('preview-sheet');
                }
            });
        });
    }

    const adminBtnDownloadPDF = document.getElementById('adminBtnDownloadPDF');
    if (adminBtnDownloadPDF && adminIdCardContainer) {
        adminBtnDownloadPDF.addEventListener('click', async () => {
            const { jsPDF } = window.jspdf;
            const origHTML = adminBtnDownloadPDF.innerHTML;
            adminBtnDownloadPDF.disabled = true;
            adminBtnDownloadPDF.innerHTML = `<i data-feather="loader"></i> Generating...`;
            feather.replace();

            try {
                const idCardFront = document.getElementById('adminIdCardFront');
                const idCardBack = document.getElementById('adminIdCardBack');
                const originalContainerClass = adminIdCardContainer.className;
                
                adminIdCardContainer.className = "id-card-container preview-sheet";
                
                const canvasFront = await html2canvas(idCardFront, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgFront = canvasFront.toDataURL('image/png');

                const canvasBack = await html2canvas(idCardBack, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgBack = canvasBack.toDataURL('image/png');
                
                adminIdCardContainer.className = originalContainerClass;

                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(15, 23, 42);
                pdf.text("Homesly stays HRM Employee ID Card", 105, 20, { align: "center" });
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(10);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`Printed for: ${selectedEmployeeForID?.name || 'Staff'}. CR80 Dimensions (54mm x 85.6mm).`, 105, 26, { align: "center" });

                const cardW = 54;
                const cardH = 85.6;
                const startY = 45;
                const frontX = 46;
                const backX = frontX + cardW + 10;

                pdf.addImage(imgFront, 'PNG', frontX, startY, cardW, cardH);
                pdf.addImage(imgBack, 'PNG', backX, startY, cardW, cardH);

                pdf.setDrawColor(203, 213, 225);
                pdf.setLineDashPattern([2, 2], 0);
                pdf.rect(frontX, startY, cardW, cardH);
                pdf.rect(backX, startY, cardW, cardH);

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(9);
                pdf.setTextColor(148, 163, 184);
                pdf.text("Instructions: Cut along the dotted line, fold in half, and laminate.", 105, startY + cardH + 15, { align: "center" });

                const fileName = `homesly_stays_hrm_id_card_${selectedEmployeeForID?.employeeId || 'HM-0000'}.pdf`;
                pdf.save(fileName);

                adminBtnDownloadPDF.innerHTML = `<i data-feather="check"></i> Downloaded`;
                setTimeout(() => {
                    adminBtnDownloadPDF.innerHTML = origHTML;
                    adminBtnDownloadPDF.disabled = false;
                    feather.replace();
                }, 2000);

            } catch (err) {
                console.error("PDF generation failed:", err);
                alert("PDF generation failed. Please try again.");
                adminBtnDownloadPDF.innerHTML = origHTML;
                adminBtnDownloadPDF.disabled = false;
                feather.replace();
            }
        });
    }

    // --- NOTICE BOARD CRUD SYSTEM ---
    let noticesList = [];

    function renderAdminNotices() {
        const tableBody = document.getElementById('globalNoticesTable');
        if (!tableBody) return;
        
        let tableHTML = "";
        noticesList.forEach(notice => {
            const pubDate = new Date(notice.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const expDate = notice.expiryDate 
                ? new Date(notice.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : "<span style='color:#94A3B8'>Never</span>";
            
            const badgeClass = `badge-${notice.priority || 'normal'}`;
            const toggleText = notice.active !== false ? 'Expire' : 'Activate';
            
            tableHTML += `<tr>
                <td>
                    <strong>${notice.title}</strong>
                    <div style="font-size:0.75rem; color:#64748B; margin-top:2px;">${notice.content.substring(0, 50)}${notice.content.length > 50 ? '...' : ''}</div>
                    <div style="font-size:0.7rem; color:#94A3B8; margin-top:2px;">Published: ${pubDate}</div>
                </td>
                <td><span class="notice-badge ${badgeClass}">${notice.priority}</span></td>
                <td>${expDate}</td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-secondary btn-sm btn-toggle-notice-active" data-id="${notice.id}" data-active="${notice.active !== false}">${toggleText}</button>
                        <button class="btn btn-secondary btn-sm btn-delete-notice" data-id="${notice.id}" style="background:#FEE2E2; color:#991B1B; border-color:#FECACA;"><i data-feather="trash" style="width:12px;"></i></button>
                    </div>
                </td>
            </tr>`;
        });
        
        if (noticesList.length === 0) {
            tableHTML = `<tr><td colspan="4" style="text-align:center; padding:32px 0; color:#64748B;">No notices published yet.</td></tr>`;
        }
        
        tableBody.innerHTML = tableHTML;
        feather.replace();
        bindNoticeActions();
    }
    
    function bindNoticeActions() {
        const toggleBtns = document.querySelectorAll('.btn-toggle-notice-active');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const currentActive = e.currentTarget.getAttribute('data-active') === 'true';
                try {
                    await updateDoc(doc(db, "notices", id), { active: !currentActive });
                } catch (e) {
                    console.error("Notice toggle error:", e);
                }
            });
        });
        
        const deleteBtns = document.querySelectorAll('.btn-delete-notice');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm("Are you sure you want to delete this notice?")) {
                    try {
                        await deleteDoc(doc(db, "notices", id));
                    } catch (e) {
                        console.error("Notice delete error:", e);
                    }
                }
            });
        });
    }

    const addNoticeForm = document.getElementById('addNoticeForm');
    if (addNoticeForm) {
        addNoticeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btnNoticeSubmit');
            const origText = submitBtn.textContent;
            
            const title = document.getElementById('noticeTitle').value;
            const content = document.getElementById('noticeContent').value;
            const priority = document.getElementById('noticePriority').value;
            const expiryDate = document.getElementById('noticeExpiry').value;
            
            submitBtn.disabled = true;
            submitBtn.textContent = "Publishing...";
            
            try {
                const newNoticeId = 'NT-' + Math.floor(1000 + Math.random() * 9000);
                await setDoc(doc(db, "notices", newNoticeId), {
                    title: title,
                    content: content,
                    priority: priority,
                    expiryDate: expiryDate || null,
                    publishDate: new Date().toISOString().split('T')[0],
                    active: true,
                    createdBy: CURRENT_ADMIN_ID
                });
                
                addNoticeForm.reset();
                console.log(`[Notice Board] Published notice: ${title}`);
            } catch (err) {
                console.error("Error creating notice:", err);
                alert("Failed to publish notice: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = origText;
            }
        });
    }

    // --- CALENDAR CRUD SYSTEM ---
    let calendarEventsList = [];
    let adminCalendarCurrentDate = new Date();

    function renderAdminCalendarEventsTable() {
        const tableBody = document.getElementById('globalCalEventsTable');
        if (!tableBody) return;
        
        let tableHTML = "";
        calendarEventsList.forEach(evt => {
            const dateStr = new Date(evt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const typeLabel = {
                'public_holiday': 'Public Holiday',
                'festival_holiday': 'Festival',
                'company_holiday': 'Company Holiday',
                'team_event': 'Team Event',
                'important_date': 'Important Date'
            }[evt.type] || evt.type;
            
            tableHTML += `<tr>
                <td>
                    <strong>${evt.title}</strong>
                    <div style="font-size:0.7rem; color:#64748B;">${typeLabel}</div>
                </td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn btn-secondary btn-sm btn-delete-cal-event" data-id="${evt.id}" style="background:#FEE2E2; color:#991B1B; border-color:#FECACA;"><i data-feather="trash" style="width:12px;"></i></button>
                </td>
            </tr>`;
        });
        
        if (calendarEventsList.length === 0) {
            tableHTML = `<tr><td colspan="3" style="text-align:center; padding:12px; color:#64748B;">No events configured.</td></tr>`;
        }
        
        tableBody.innerHTML = tableHTML;
        feather.replace();
        bindCalendarEventActions();
    }
    
    function bindCalendarEventActions() {
        const deleteBtns = document.querySelectorAll('.btn-delete-cal-event');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm("Delete this calendar event?")) {
                    try {
                        await deleteDoc(doc(db, "calendar_events", id));
                    } catch (e) {
                        console.error("Calendar event delete error:", e);
                    }
                }
            });
        });
    }

    const addCalendarEventForm = document.getElementById('addCalendarEventForm');
    if (addCalendarEventForm) {
        addCalendarEventForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('calEventTitle').value;
            const date = document.getElementById('calEventDate').value;
            const type = document.getElementById('calEventType').value;
            
            try {
                const newEvtId = 'EV-' + Math.floor(1000 + Math.random() * 9000);
                await setDoc(doc(db, "calendar_events", newEvtId), {
                    title: title,
                    date: date,
                    type: type,
                    createdAt: new Date().toISOString()
                });
                
                addCalendarEventForm.reset();
                console.log(`[Calendar] Configured event: ${title}`);
            } catch (err) {
                console.error("Error creating calendar event:", err);
                alert("Failed to add event: " + err.message);
            }
        });
    }
    
    function renderAdminCalendar() {
        const grid = document.getElementById('adminCalendarGrid');
        const monthTitle = document.getElementById('adminCalendarMonthTitle');
        if (!grid || !monthTitle) return;
        
        const year = adminCalendarCurrentDate.getFullYear();
        const month = adminCalendarCurrentDate.getMonth();
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthTitle.textContent = `${monthNames[month]} ${year}`;
        
        grid.innerHTML = "";
        
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
            
            calendarEventsList.forEach(evt => {
                if (evt.date === cellDateStr) {
                    const el = document.createElement('div');
                    el.className = `calendar-event event-${evt.type}`;
                    el.textContent = evt.title;
                    el.title = `${evt.title} (${evt.type.replace('_', ' ')})`;
                    eventsContainer.appendChild(el);
                }
            });
            
            const filteredApprovedLeaves = leaveRequests.filter(req => {
                if (req.status !== "Approved") return false;
                const emp = usersMap[req.userId];
                if (!emp) return false;
                if (adminProfile.role === 'team_lead') {
                    const isReportingManager = emp.reportingManager === adminProfile.id;
                    const isSameDepartment = emp.department === adminProfile.department;
                    if (!isReportingManager && !isSameDepartment) {
                        return false;
                    }
                }
                return true;
            });
            
            filteredApprovedLeaves.forEach(leave => {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                cellDate.setHours(0,0,0,0);
                start.setHours(0,0,0,0);
                end.setHours(0,0,0,0);
                
                if (cellDate >= start && cellDate <= end) {
                    const emp = usersMap[leave.userId] || { name: "Staff" };
                    const el = document.createElement('div');
                    el.className = "calendar-event event-leave";
                    el.textContent = `${emp.name} (Leave)`;
                    el.title = `${emp.name}: ${leave.startDate} to ${leave.endDate}`;
                    eventsContainer.appendChild(el);
                }
            });
            
            cell.appendChild(eventsContainer);
            grid.appendChild(cell);
        }
    }
    
    const btnAdminPrevMonth = document.getElementById('btnAdminPrevMonth');
    const btnAdminNextMonth = document.getElementById('btnAdminNextMonth');
    if (btnAdminPrevMonth) {
        btnAdminPrevMonth.addEventListener('click', () => {
            adminCalendarCurrentDate.setMonth(adminCalendarCurrentDate.getMonth() - 1);
            renderAdminCalendar();
        });
    }
    if (btnAdminNextMonth) {
        btnAdminNextMonth.addEventListener('click', () => {
            adminCalendarCurrentDate.setMonth(adminCalendarCurrentDate.getMonth() + 1);
            renderAdminCalendar();
        });
    }

    function initializeAdminSettings() {
        if (!adminProfile) return;

        // 1. Populate form inputs
        const sName = document.getElementById('adminSettingsName');
        const sEmpId = document.getElementById('adminSettingsEmpId');
        const sEmail = document.getElementById('adminSettingsEmail');
        const sPhone = document.getElementById('adminSettingsPhone');
        const sDesignation = document.getElementById('adminSettingsDesignation');
        const sDepartment = document.getElementById('adminSettingsDepartment');
        const sDob = document.getElementById('adminSettingsDob');
        const sGender = document.getElementById('adminSettingsGender');
        const sEmergencyContact = document.getElementById('adminSettingsEmergencyContact');
        const sBloodGroup = document.getElementById('adminSettingsBloodGroup');
        const sAvatarPreview = document.getElementById('adminSettingsAvatarPreview');

        if (sName) sName.value = adminProfile.name || "";
        if (sEmpId) sEmpId.value = adminProfile.employeeId || "";
        if (sEmail) sEmail.value = adminProfile.email || "";
        if (sPhone) sPhone.value = adminProfile.phone || "";
        if (sDesignation) sDesignation.value = adminProfile.designation || "";
        if (sDepartment) sDepartment.value = adminProfile.department || "";
        if (sDob) sDob.value = adminProfile.dob || "";
        if (sGender) sGender.value = adminProfile.gender || "other";
        if (sEmergencyContact) sEmergencyContact.value = adminProfile.emergencyContact || "";
        if (sBloodGroup) sBloodGroup.value = adminProfile.bloodGroup || "";
        if (sAvatarPreview) sAvatarPreview.src = adminProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(adminProfile.name || 'Admin')}&background=4F46E5&color=fff`;

        // 2. Populate ID Card preview
        updateAdminSelfIDCard();

        // 3. Bind live input change preview
        const previewFields = [
            { id: 'adminSettingsName', targetId: 'adminSelfIdCardName', default: 'Admin Name' },
            { id: 'adminSettingsDesignation', targetId: 'adminSelfIdCardDesignation', default: 'Designation' },
            { id: 'adminSettingsPhone', targetId: 'adminSelfIdCardPhone', default: '-' },
            { id: 'adminSettingsEmergencyContact', targetId: 'adminSelfIdCardEmergencyContact', default: '-' }
        ];

        previewFields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const target = document.getElementById(f.targetId);
                    if (target) target.textContent = e.target.value || f.default;

                    if (f.id === 'adminSettingsName') {
                        const sigTarget = document.getElementById('adminSelfIdCardSignature');
                        if (sigTarget) sigTarget.textContent = e.target.value || f.default;
                    }
                });
            }
        });

        const deptEl = document.getElementById('adminSettingsDepartment');
        if (deptEl) {
            deptEl.addEventListener('input', (e) => {
                const target = document.getElementById('adminSelfIdCardDept');
                if (target) target.textContent = e.target.value || 'Unassigned';
            });
        }

        const genderEl = document.getElementById('adminSettingsGender');
        if (genderEl) {
            genderEl.addEventListener('change', (e) => {
                const target = document.getElementById('adminSelfIdCardGender');
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

        const bgEl = document.getElementById('adminSettingsBloodGroup');
        if (bgEl) {
            bgEl.addEventListener('change', (e) => {
                const target = document.getElementById('adminSelfIdCardBloodGroup');
                if (target) target.textContent = e.target.value || '-';
            });
        }

        // 4. Bind profile image upload
        const profUpload = document.getElementById('adminProfileUpload');
        if (profUpload) {
            profUpload.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        adminProfile.avatar = e.target.result;
                        if (sAvatarPreview) sAvatarPreview.src = e.target.result;
                        const cardAvatar = document.getElementById('adminSelfIdCardAvatar');
                        if (cardAvatar) cardAvatar.src = e.target.result;
                    }
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }

        // 5. Form submission
        const form = document.getElementById('adminSettingsForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('adminSettingsSubmitBtn');
                const origHTML = btn.innerHTML;

                btn.disabled = true;
                btn.innerHTML = `<i data-feather="loader"></i> Saving...`;
                feather.replace();

                const profilePayload = {
                    name: document.getElementById('adminSettingsName').value,
                    email: document.getElementById('adminSettingsEmail').value,
                    phone: document.getElementById('adminSettingsPhone').value,
                    dob: document.getElementById('adminSettingsDob').value,
                    gender: document.getElementById('adminSettingsGender').value,
                    designation: document.getElementById('adminSettingsDesignation').value,
                    department: document.getElementById('adminSettingsDepartment').value,
                    avatar: adminProfile.avatar || "",
                    emergencyContact: document.getElementById('adminSettingsEmergencyContact').value,
                    bloodGroup: document.getElementById('adminSettingsBloodGroup').value
                };

                try {
                    const userRef = doc(db, "users", CURRENT_ADMIN_ID);
                    await updateDoc(userRef, profilePayload);

                    adminProfile = { ...adminProfile, ...profilePayload };
                    
                    // Update header user profile UI
                    initializeAdminUI();

                    btn.innerHTML = `<i data-feather="check"></i> Profile Updated`;
                    btn.classList.add('btn-success');
                    feather.replace();

                    setTimeout(() => {
                        btn.innerHTML = origHTML;
                        btn.classList.remove('btn-success');
                        btn.disabled = false;
                        feather.replace();
                    }, 2000);

                } catch (err) {
                    console.error("[Firebase] Admin Profile Update Error: ", err);
                    btn.innerHTML = `<i data-feather="alert-circle"></i> Update Failed`;
                    setTimeout(() => {
                        btn.innerHTML = origHTML;
                        btn.disabled = false;
                        feather.replace();
                    }, 2000);
                }
            });
        }

        // 6. ID Card Switcher and Export PDF
        const idCardContainer = document.getElementById('adminSelfIdCardContainer');
        const switcherBtns = document.querySelectorAll('.id-card-switcher button');
        if (switcherBtns && idCardContainer) {
            switcherBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.id === 'adminSelfBtnShowFront' || btn.id === 'adminSelfBtnShowBack' || btn.id === 'adminSelfBtnShowSheet') {
                        switcherBtns.forEach(b => {
                            if (b.id === 'adminSelfBtnShowFront' || b.id === 'adminSelfBtnShowBack' || b.id === 'adminSelfBtnShowSheet') {
                                b.classList.remove('active');
                            }
                        });
                        btn.classList.add('active');
                        idCardContainer.className = "id-card-container";
                        if (btn.id === 'adminSelfBtnShowFront') idCardContainer.classList.add('preview-front');
                        if (btn.id === 'adminSelfBtnShowBack') idCardContainer.classList.add('preview-back');
                        if (btn.id === 'adminSelfBtnShowSheet') idCardContainer.classList.add('preview-sheet');
                    }
                });
            });
        }

        const btnDownloadPDF = document.getElementById('adminSelfBtnDownloadPDF');
        if (btnDownloadPDF && idCardContainer) {
            btnDownloadPDF.addEventListener('click', async () => {
                const { jsPDF } = window.jspdf;
                const origHTML = btnDownloadPDF.innerHTML;
                btnDownloadPDF.disabled = true;
                btnDownloadPDF.innerHTML = `<i data-feather="loader"></i> Generating...`;
                feather.replace();

                try {
                    const idCardFront = document.getElementById('adminSelfIdCardFront');
                    const idCardBack = document.getElementById('adminSelfIdCardBack');
                    const originalContainerClass = idCardContainer.className;
                    
                    idCardContainer.className = "id-card-container preview-sheet";
                    
                    const canvasFront = await html2canvas(idCardFront, {
                        scale: 3,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: null
                    });
                    const imgFront = canvasFront.toDataURL('image/png');

                    const canvasBack = await html2canvas(idCardBack, {
                        scale: 3,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: null
                    });
                    const imgBack = canvasBack.toDataURL('image/png');
                    
                    idCardContainer.className = originalContainerClass;

                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4'
                    });

                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(16);
                    pdf.setTextColor(15, 23, 42);
                    pdf.text("Homesly stays HRM Employee ID Card", 105, 20, { align: "center" });
                    
                    pdf.setFont("helvetica", "normal");
                    pdf.setFontSize(10);
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`Printed for: ${adminProfile.name || 'Staff'}. CR80 Dimensions (54mm x 85.6mm).`, 105, 26, { align: "center" });

                    const cardW = 54;
                    const cardH = 85.6;
                    const startY = 45;
                    const frontX = 46;
                    const backX = frontX + cardW + 10;

                    pdf.addImage(imgFront, 'PNG', frontX, startY, cardW, cardH);
                    pdf.addImage(imgBack, 'PNG', backX, startY, cardW, cardH);

                    pdf.setDrawColor(203, 213, 225);
                    pdf.setLineDashPattern([2, 2], 0);
                    pdf.rect(frontX, startY, cardW, cardH);
                    pdf.rect(backX, startY, cardW, cardH);

                    pdf.setFont("helvetica", "normal");
                    pdf.setFontSize(9);
                    pdf.setTextColor(148, 163, 184);
                    pdf.text("Instructions: Cut along the dotted line, fold in half, and laminate.", 105, startY + cardH + 15, { align: "center" });

                    const fileName = `homesly_stays_hrm_id_card_${adminProfile.employeeId || 'HM-0000'}.pdf`;
                    pdf.save(fileName);

                    btnDownloadPDF.innerHTML = `<i data-feather="check"></i> Downloaded`;
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

        // 7. Make sidebar user profile clickable to go to Settings
        const sidebarProfile = document.querySelector('.user-profile');
        if (sidebarProfile) {
            sidebarProfile.style.cursor = 'pointer';
            sidebarProfile.addEventListener('click', () => {
                window.location.hash = '#admin-settings';
            });
        }
    }

    function updateAdminSelfIDCard() {
        const idCardName = document.getElementById('adminSelfIdCardName');
        const idCardDesignation = document.getElementById('adminSelfIdCardDesignation');
        const idCardEmpId = document.getElementById('adminSelfIdCardEmpId');
        const idCardDept = document.getElementById('adminSelfIdCardDept');
        const idCardGender = document.getElementById('adminSelfIdCardGender');
        const idCardPhone = document.getElementById('adminSelfIdCardPhone');
        const idCardAvatar = document.getElementById('adminSelfIdCardAvatar');
        const idCardBarcodeText = document.getElementById('adminSelfIdCardBarcodeText');
        const idCardQR = document.getElementById('adminSelfIdCardQR');

        // Back Card Elements
        const idCardJoinDate = document.getElementById('adminSelfIdCardJoinDate');
        const idCardExpiryDate = document.getElementById('adminSelfIdCardExpiryDate');
        const idCardEmergencyContact = document.getElementById('adminSelfIdCardEmergencyContact');
        const idCardSignature = document.getElementById('adminSelfIdCardSignature');
        const idCardBloodGroup = document.getElementById('adminSelfIdCardBloodGroup');

        if (idCardName) idCardName.textContent = adminProfile.name || 'Admin Name';
        if (idCardDesignation) idCardDesignation.textContent = adminProfile.designation || 'Designation';
        if (idCardEmpId) idCardEmpId.textContent = adminProfile.employeeId || 'HM-0000';
        if (idCardDept) idCardDept.textContent = adminProfile.department || 'Unassigned';
        if (idCardGender) {
            const genderLabel = {
                'female': 'Female',
                'male': 'Male',
                'other': 'Other',
                'prefer_not': 'Other'
            }[adminProfile.gender] || adminProfile.gender || 'Other';
            idCardGender.textContent = genderLabel;
        }
        if (idCardPhone) idCardPhone.textContent = adminProfile.phone || '-';
        if (idCardAvatar) idCardAvatar.src = adminProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(adminProfile.name || 'Admin')}&background=4F46E5&color=fff`;
        if (idCardBarcodeText) idCardBarcodeText.textContent = adminProfile.employeeId || 'HM0000';

        // QR Code API Integration
        if (idCardQR) {
            const qrData = encodeURIComponent(`ID: ${adminProfile.employeeId || 'HM-0000'}\nName: ${adminProfile.name || 'Admin'}\nDept: ${adminProfile.department || 'Unassigned'}\nPhone: ${adminProfile.phone || '-'}`);
            idCardQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;
        }

        // Back Card
        if (idCardJoinDate) {
            const jd = adminProfile.joinDate || adminProfile.createdAt;
            idCardJoinDate.textContent = jd ? new Date(jd).toLocaleDateString('en-GB') : '-';
        }
        if (idCardExpiryDate) {
            let ed = adminProfile.expiryDate;
            if (!ed) {
                const jd = adminProfile.joinDate || adminProfile.createdAt;
                if (jd) {
                    const jdObj = new Date(jd);
                    ed = new Date(jdObj.setFullYear(jdObj.getFullYear() + 5)).toISOString();
                }
            }
            idCardExpiryDate.textContent = ed ? new Date(ed).toLocaleDateString('en-GB') : '-';
        }
        if (idCardEmergencyContact) idCardEmergencyContact.textContent = adminProfile.emergencyContact || '-';
        if (idCardSignature) idCardSignature.textContent = adminProfile.name || 'Admin Signature';
        if (idCardBloodGroup) idCardBloodGroup.textContent = adminProfile.bloodGroup || '-';
    }

    // Duplicate mobile menu responsiveness and DOMContentLoaded closing brace removed
}
