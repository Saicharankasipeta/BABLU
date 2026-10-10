/* ==========================================
   MY PERSONAL VAULT
   Supabase Authentication + PIN Protection
   Photos Gallery + Documents + Personal Gallery
   ========================================== */

const SUPABASE_URL = "https://kflffrhzcsoyotkvbkym.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vQy7JBCqr3SrlGXA_cBeJQ_OpPJ2Kay";

let client = null;
let currentUser = null;
let personalUnlocked = false;
let busy = false;

const $ = id => document.getElementById(id);

const loginPage = $("loginPage");
const vaultPage = $("vaultPage");
const fileSection = $("fileSection");
const fileList = $("fileList");
const pinModal = $("pinModal");
const viewer = $("photoViewer");

function showMessage(id, text, color = "#e2e8f0") {
    const element = $(id);
    if (!element) return;

    element.textContent = text;
    element.style.color = color;
}

function initializeSupabase() {
    if (!window.supabase) {
        throw new Error("Supabase failed to load. Check your internet.");
    }

    if (
        SUPABASE_URL.includes("PASTE_YOUR") ||
        SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR")
    ) {
        throw new Error("Add your Supabase URL and Publishable key in script.js.");
    }

    client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );
}

function clearPinFields() {
    $("personalPin").value = "";
    $("newPersonalPin").value = "";
    $("confirmPersonalPin").value = "";

    showMessage("pinMessage", "");
    showMessage("setPinMessage", "");
}

function showLogin() {
    loginPage.classList.add("active");
    vaultPage.classList.remove("active");

    fileSection.hidden = true;
    fileList.replaceChildren();
    pinModal.hidden = true;

    closePhoto();

    personalUnlocked = false;
    currentUser = null;
    clearPinFields();
}

function showVault(user) {
    currentUser = user;

    loginPage.classList.remove("active");
    vaultPage.classList.add("active");

    $("userEmail").textContent = user.email || "";
}

async function getUser() {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;
    if (!data.user) throw new Error("Please log in again.");

    currentUser = data.user;
    return data.user;
}

/* LOGIN */

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!client) return;

    const button = $("loginButton");
    button.disabled = true;

    showMessage("loginMessage", "Signing in...");

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: $("email").value.trim(),
            password: $("password").value
        });

        if (error) throw error;

        personalUnlocked = false;
        showVault(data.user);

        showMessage("loginMessage", "");
    } catch (error) {
        console.error(error);
        showMessage("loginMessage", error.message, "#fca5a5");
    } finally {
        button.disabled = false;
    }
});

/* PERSONAL PIN SECURITY */

async function setPersonalPIN(pin) {
    if (!/^\d{6}$/.test(pin)) {
        throw new Error("PIN must contain exactly six digits.");
    }

    const { error } = await client.rpc("set_personal_pin", {
        p_pin: pin
    });

    if (error) throw error;
}

async function unlockPersonalPIN(pin) {
    if (!/^\d{6}$/.test(pin)) {
        throw new Error("Enter exactly six digits.");
    }

    const { data, error } = await client.rpc(
        "unlock_personal_vault",
        { p_pin: pin }
    );

    if (error) throw error;

    if (data !== true) {
        throw new Error("Incorrect PIN.");
    }

    personalUnlocked = true;
}

async function checkPersonalPINStatus() {
    const { data, error } = await client.rpc(
        "personal_vault_is_unlocked"
    );

    if (error) throw error;

    personalUnlocked = data === true;
    return personalUnlocked;
}

async function lockPersonalPIN() {
    personalUnlocked = false;

    if (!client || !currentUser) return;

    const { error } = await client.rpc("lock_personal_vault");

    if (error) throw error;
}

function openPinModal() {
    clearPinFields();
    pinModal.hidden = false;
    $("personalPin").focus();
}

$("pinForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("pinUnlockButton");
    button.disabled = true;

    try {
        await unlockPersonalPIN($("personalPin").value);

        pinModal.hidden = true;
        $("personalPin").value = "";

        await renderFiles("Personal");
    } catch (error) {
        console.error(error);
        showMessage("pinMessage", error.message, "#fca5a5");
    } finally {
        button.disabled = false;
    }
});

$("setPinForm").addEventListener("submit", async event => {
    event.preventDefault();

    const pin = $("newPersonalPin").value;
    const confirmation = $("confirmPersonalPin").value;

    if (pin !== confirmation) {
        showMessage("setPinMessage", "PINs do not match.", "#fca5a5");
        return;
    }

    try {
        await setPersonalPIN(pin);

        showMessage(
            "setPinMessage",
            "PIN saved! Enter it above to unlock.",
            "#86efac"
        );

        $("newPersonalPin").value = "";
        $("confirmPersonalPin").value = "";
        $("personalPin").focus();
    } catch (error) {
        console.error(error);
        showMessage("setPinMessage", error.message, "#fca5a5");
    }
});

$("pinCancelButton").addEventListener("click", () => {
    pinModal.hidden = true;
    clearPinFields();

    fileSection.hidden = true;
    fileList.replaceChildren();
});

/* LOGOUT */

$("logoutButton").addEventListener("click", async () => {
    try {
        await lockPersonalPIN();

        const { error } = await client.auth.signOut();
        if (error) throw error;

        $("password").value = "";
        showLogin();
    } catch (error) {
        console.error(error);
        alert("Logout failed: " + error.message);
    }
});

/* CATEGORY NAVIGATION */

document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", async () => {
        const category = button.dataset.category;

        if (category === "Personal") {
            try {
                if (!(await checkPersonalPINStatus())) {
                    openPinModal();
                    return;
                }

                await renderFiles("Personal");
            } catch (error) {
                console.error(error);
                openPinModal();
                showMessage("pinMessage", error.message, "#fca5a5");
            }
        } else {
            await renderFiles(category);
        }
    });
});

$("closeFilesButton").addEventListener("click", async () => {
    const category = $("fileSectionTitle").dataset.category;

    fileSection.hidden = true;
    fileList.replaceChildren();

    if (category === "Personal") {
        try {
            await lockPersonalPIN();
        } catch (error) {
            console.error(error);
            alert("Could not lock Personal files on the server.");
        }
    }
});

/* UPLOAD FILES */

$("uploadButton").addEventListener("click", async () => {
    if (busy || !client) return;

    const category = $("categorySelect").value;
    const files = Array.from($("fileInput").files);

    if (!files.length) {
        showMessage("uploadMessage", "Choose files first.", "#fca5a5");
        return;
    }

    if (category === "Personal") {
        try {
            if (!(await checkPersonalPINStatus())) {
                openPinModal();
                showMessage("pinMessage", "Unlock Personal before uploading.");
                return;
            }
        } catch (error) {
            showMessage("uploadMessage", error.message, "#fca5a5");
            return;
        }
    }

    busy = true;
    $("uploadButton").disabled = true;

    try {
        const user = await getUser();
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path =
                `${user.id}/${category}/${Date.now()}_${i}_${safeName}`;

            showMessage(
                "uploadMessage",
                `Uploading ${i + 1}/${files.length}: ${file.name}`
            );

            const { error } = await client.storage
                .from("vault")
                .upload(path, file, { upsert: false });

            if (error) {
                console.error(error);
                failedCount++;
            } else {
                successCount++;
            }
        }

        $("fileInput").value = "";

        showMessage(
            "uploadMessage",
            `${successCount} uploaded; ${failedCount} failed.`,
            failedCount ? "#fca5a5" : "#86efac"
        );

        await renderFiles(category);
    } catch (error) {
        console.error(error);
        showMessage("uploadMessage", error.message, "#fca5a5");
    } finally {
        busy = false;
        $("uploadButton").disabled = false;
    }
});

/* LIST FILES */

async function renderFiles(category) {
    if (!client) return;

    if (category === "Personal") {
        try {
            if (!(await checkPersonalPINStatus())) {
                personalUnlocked = false;
                openPinModal();
                return;
            }
        } catch (error) {
            console.error(error);
            openPinModal();
            showMessage("pinMessage", error.message, "#fca5a5");
            return;
        }
    }

    try {
        const user = await getUser();

        fileSection.hidden = false;

        $("fileSectionTitle").textContent = {
            Photos: "📸 Photos Gallery",
            Documents: "📄 Documents",
            Personal: "🔒 Personal Gallery"
        }[category];

        $("fileSectionTitle").dataset.category = category;
        fileList.textContent = "Loading files...";

        const { data, error } = await client.storage
            .from("vault")
            .list(`${user.id}/${category}`, {
                limit: 100,
                sortBy: {
                    column: "created_at",
                    order: "desc"
                }
            });

        if (error) throw error;

        const files = (data || []).filter(file => file.name);

        if (!files.length) {
            fileList.innerHTML =
                '<p class="empty-message">No files here yet.</p>';
            return;
        }

        if (category === "Photos" || category === "Personal") {
            await renderPhotoGallery(user.id, category, files);
        } else {
            renderFileList(category, files);
        }
    } catch (error) {
        console.error(error);
        fileList.textContent = "Could not load files: " + error.message;
    }
}

/* PHOTO GALLERY FOR PHOTOS AND PERSONAL */

async function renderPhotoGallery(userId, category, files) {
    fileList.replaceChildren();

    const gallery = document.createElement("div");
    gallery.className = "photo-gallery";

    const imageFiles = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name)
    );

    const otherFiles = files.filter(file =>
        !/\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name)
    );

    for (const file of imageFiles) {
        const path = `${userId}/${category}/${file.name}`;

        const { data, error } = await client.storage
            .from("vault")
            .createSignedUrl(path, 60);

        if (error) {
            console.error("Image URL error:", error);
            continue;
        }

        const card = document.createElement("div");
        card.className = "photo-card";

        const image = document.createElement("img");
        image.src = data.signedUrl;
        image.alt = file.name;
        image.loading = "lazy";
        image.title = file.name;

        image.addEventListener("click", () => {
            openPhoto(data.signedUrl);
        });

        const remove = document.createElement("button");
        remove.className = "photo-delete";
        remove.textContent = "🗑️";
        remove.title = "Delete photo";

        remove.addEventListener("click", event => {
            event.stopPropagation();
            deleteFile(category, file.name);
        });

        card.append(image, remove);
        gallery.appendChild(card);
    }

    if (gallery.children.length) {
        fileList.appendChild(gallery);
    }

    if (otherFiles.length) {
        const heading = document.createElement("h3");
        heading.textContent = "📄 Other files";
        fileList.appendChild(heading);

        const otherContainer = document.createElement("div");
        fileList.appendChild(otherContainer);

        for (const file of otherFiles) {
            const row = document.createElement("div");
            row.className = "file-item";

            const name = document.createElement("div");
            name.className = "file-name";
            name.textContent = file.name;

            const actions = document.createElement("div");
            actions.className = "file-actions";

            const download = document.createElement("button");
            download.className = "download-btn";
            download.textContent = "⬇️ Download";
            download.addEventListener("click", () => {
                downloadFile(category, file.name);
            });

            const remove = document.createElement("button");
            remove.className = "danger";
            remove.textContent = "🗑️ Delete";
            remove.addEventListener("click", () => {
                deleteFile(category, file.name);
            });

            actions.append(download, remove);
            row.append(name, actions);
            otherContainer.appendChild(row);
        }
    }

    if (!gallery.children.length && !otherFiles.length) {
        fileList.innerHTML =
            '<p class="empty-message">No supported images found.</p>';
    }
}

/* DOCUMENTS AND NON-IMAGE FILES */

function renderFileList(category, files) {
    fileList.replaceChildren();

    for (const file of files) {
        const row = document.createElement("div");
        row.className = "file-item";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = file.name;

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const download = document.createElement("button");
        download.className = "download-btn";
        download.textContent = "⬇️ Download";
        download.addEventListener("click", () => {
            downloadFile(category, file.name);
        });

        const remove = document.createElement("button");
        remove.className = "danger";
        remove.textContent = "🗑️ Delete";
        remove.addEventListener("click", () => {
            deleteFile(category, file.name);
        });

        actions.append(download, remove);
        row.append(name, actions);
        fileList.appendChild(row);
    }
}

/* DOWNLOAD */

async function downloadFile(category, name) {
    try {
        if (category === "Personal" && !(await checkPersonalPINStatus())) {
            personalUnlocked = false;
            openPinModal();
            return;
        }

        const user = await getUser();
        const path = `${user.id}/${category}/${name}`;

        const { data, error } = await client.storage
            .from("vault")
            .createSignedUrl(path, 60, { download: name });

        if (error) throw error;

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
        console.error(error);
        alert("Download failed: " + error.message);
    }
}

/* DELETE */

async function deleteFile(category, name) {
    try {
        if (category === "Personal" && !(await checkPersonalPINStatus())) {
            personalUnlocked = false;
            openPinModal();
            return;
        }

        if (!confirm(`Delete "${name}" permanently?`)) return;

        const user = await getUser();
        const path = `${user.id}/${category}/${name}`;

        const { error } = await client.storage
            .from("vault")
            .remove([path]);

        if (error) throw error;

        await renderFiles(category);
    } catch (error) {
        console.error(error);
        alert("Delete failed: " + error.message);
    }
}

/* PHOTO VIEWER */

function openPhoto(url) {
    $("viewerImage").src = url;
    viewer.hidden = false;
}

function closePhoto() {
    if (!viewer) return;

    viewer.hidden = true;
    $("viewerImage").src = "";
}

$("viewerCloseButton").addEventListener("click", closePhoto);

viewer.addEventListener("click", event => {
    if (event.target === viewer) closePhoto();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closePhoto();

        if (!pinModal.hidden) {
            pinModal.hidden = true;
            clearPinFields();
            fileSection.hidden = true;
            fileList.replaceChildren();
        }
    }
});

/* LOCK WHEN TAB IS HIDDEN */

document.addEventListener("visibilitychange", async () => {
    if (document.hidden && personalUnlocked) {
        try {
            await lockPersonalPIN();
        } catch (error) {
            console.error("Automatic lock failed:", error);
        }

        fileSection.hidden = true;
        fileList.replaceChildren();
    }
});

/* INITIALIZE APP */

async function startApp() {
    try {
        initializeSupabase();

        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        if (data.session) {
            showVault(data.session.user);
        } else {
            showLogin();
        }

        client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" || !session) {
                personalUnlocked = false;
                showLogin();
            } else if (session.user) {
                showVault(session.user);
            }
        });
    } catch (error) {
        console.error(error);
        showMessage("loginMessage", error.message, "#fca5a5");
    }
}

startApp();