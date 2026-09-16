document.addEventListener('DOMContentLoaded', async (event) => {
    let API_Ext;
    let apiTCUrl;
    const locationParent = location.href.substring(0, location.href.lastIndexOf("/"));

    async function doConnect() {

        API_Ext = await TrimbleConnectWorkspace.connect(window.parent, (event, data, args) => {
            console.log("**Extension: ", event.type, event.data);

            var json = data.data
            var obj = json.replace('"', '');

            switch (event) {
                case "extension.command":
                    //"Command executed by the user: args.data"

                    if (obj == 'submenu_1_clicked') {
                        console.log("=====GET1: " + obj);
                        window.open(locationParent + '/index.html?accessToken=' + document.getElementById('hdnAccessTokenDetail').value + '&projectId=' + document.getElementById('hdnProjectDetail').value + '&modelId=nil' + '&userId=' + document.getElementById('hdnUserId').value + '&userEmail=' + encodeURIComponent(document.getElementById('hdnUserEmail').value), '_self');
                    }
                    break;
                case "extension.accessToken":
                    //"Accestoken or status: args.data"
                    break;
                case "extension.userSettingsChanged":
                    //"User settings changed!"
                    break;
                //default:
            }


        });

        API_Ext.ui.setMenu({
            title: "Business Leads"
            , icon: "https://api.iconify.design/tabler/scan.svg?color=%23FFFFFF"
            , command: "main_nav_menu_clicked"
            , subMenus: [
                {
                    title: "Capture",
                    icon: "https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/scan.svg",
                    command: "submenu_1_clicked",
                }
                // , {
                //     title: "Auth",
                //     icon: "https://components.connect.trimble.com/trimble-connect-project-workspace-api/logo192.png",
                //     command: "submenu_0_clicked",
                // }
            ]
        });

        API_Ext.extension.setStatusMessage("").then(setStatusMsgClear => {
            console.log("**setStatusMsgClear: " + setStatusMsgClear);
        });

        //API_Ext.ui.setActiveMenuItem("main_nav_menu_clicked");
        //API_Ext.ui.setActiveMenuItem("submenu_1_clicked");

        API_Ext.project.getProject().then(project => {
            //document.getElementById("lblprojectdetails").innerText = JSON.stringify(
            //    project.id + ',' + project.name
            //);
            //console.log("**ProjectId: " + project.id);
            document.getElementById('hdnProjectDetail').value = project.id;
            document.getElementById('hdnProjectName').value = project.name;
        });

        API_Ext.user.getUserSettings().then(userSettings => {
            //document.getElementById("lbluserdetails").innerText = JSON.stringify(
            //    userSettings.id + ',' + userSettings.firstName + ' ' + userSettings.lastName + ',' + userSettings.email
            //);
            document.getElementById('hdnUserId').value = userSettings.id;
            document.getElementById('hdnUserEmail').value = userSettings.email;
            document.getElementById('hdnUserFirstName').value = userSettings.firstName;
            document.getElementById('hdnUserLastName').value = userSettings.lastName;
            document.getElementById('hdnUserDetail').value = userSettings.id + ',' + userSettings.firstName + ' ' + userSettings.lastName + ',' + userSettings.email;
            //console.log("**Extension: " );

        });

        API_Ext.extension.getPermission("accesstoken").then(accessToken => {
            //document.getElementById("lblaccesstokendetails").innerText = JSON.stringify(
            //    accessToken
            //);
            //console.log("**Access Token: " + accessToken;
            document.getElementById('hdnAccessTokenDetail').value = accessToken;

            console.log("**Extension: AccessToken:: " + document.getElementById('hdnAccessTokenDetail').value);


        });

        API_Ext.extension.setStatusMessage("Running...").then(setStatusMsgStart => {
            console.log("**setStatusMsgStart: " + setStatusMsgStart);
        });

        const request = API_Ext.extension.requestPermission || API_Ext.extension.getPermission;

        request.call(API_Ext.extension, "accesstoken").then(token => {
            console.log("Obtained Access Token:", token);

            //document.getElementById("hdnAccessTokenDetail").value = token;

            // Optional: Immediately use the token to call a Workspace API endpoint
            fetch(`https://app.connect.trimble.com/tc/api/2.0/users/me`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            })
                .then(res => res.json())
                //.then(data => console.log("Logged-in User Info:", data))
                .then(data => {
                    const userInfo = {
                        firstName: data.firstName,
                        lastName: data.lastName,
                        id: data.id,
                        email: data.email,
                        podLocation: data.podLocation,
                        // company: {
                        //     id: data.company?.id || data.companies?.[0]?.id || null,
                        //     name: data.company?.name || data.companies?.[0]?.name || null
                        // }
                    };

                    userInfo.companyId = data.company?.id;
                    userInfo.companyName = data.company?.name;
                    userInfo.projectId = document.getElementById('hdnProjectDetail').value;
                    userInfo.accessToken = document.getElementById('hdnAccessTokenDetail').value;

                    console.log("Logged-in User Data:", data)
                    console.log("Logged-in User Info:", userInfo);
                    return userInfo; // Optional if you need it later in the chain
                })
                .catch(err => console.error("API error:", err));
        }).catch(err => {
            console.error("Failed to get access token:", err);
        });

        sleep(3000).then(() => {
            API_Ext.extension.setStatusMessage("Connected").then(setStatusMsgEnd => {
                console.log("**setStatusMsg: " + setStatusMsgEnd);
            });
        });

        API_Ext.extension.getStatusMessage().then(getStatusMsg => {
            console.log("**getStatusMsg: " + getStatusMsg);
        });

        // API_Ext.extension.broadcast("Hello!").then(setbroadcast => {
        //     console.log("**broadcast: " + setbroadcast);
        // });


    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function JSPopUp(action, text, url) {
        var result;

        if (action == 'Failed') {
            alert(text);
            //showpop6(text);
        }
    }

    await doConnect();
});