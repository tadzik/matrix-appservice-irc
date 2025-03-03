/*
 * Contains integration tests for all IRC-initiated events.
 */
const Promise = require("bluebird");

const envBundle = require("../util/env-bundle");

describe("IRC-to-Matrix message bridging", function() {

    const {env, config, roomMapping, test} = envBundle();

    let sdk = null;

    let tFromNick = "mike";
    let tUserId = "@" + roomMapping.server + "_" + tFromNick + ":" +
                  config.homeserver.domain;

    let checksum = function(str) {
        let total = 0;
        for (let i = 0; i < str.length; i++) {
            total += str.charCodeAt(i);
        }
        return total;
    };

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);

        sdk = env.clientMock._client(tUserId);
        // add registration mock impl:
        // registering should be for the irc user
        sdk._onHttpRegister({
            expectLocalpart: roomMapping.server + "_" + tFromNick,
            returnUserId: tUserId
        });

        env.ircMock._autoJoinChannels(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        // do the init
        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should bridge IRC text as Matrix message's m.text",
    function(done) {
        let testText = "this is some test text.";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            expect(content).toEqual({
                body: testText,
                msgtype: "m.text"
            });
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit("message", tFromNick, roomMapping.channel, testText);
        });
    });

    it("should bridge IRC actions as Matrix message's m.emote",
    function(done) {
        let testEmoteText = "thinks for a bit";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            expect(content).toEqual({
                body: testEmoteText,
                msgtype: "m.emote"
            });
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit("ctcp-privmsg",
                tFromNick, roomMapping.channel, "ACTION " + testEmoteText
            );
        });
    });

    it("should bridge IRC notices as Matrix message's m.notice",
    function(done) {
        let testNoticeText = "Automated bot text: SUCCESS!";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            expect(content).toEqual({
                body: testNoticeText,
                msgtype: "m.notice"
            });
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "notice", tFromNick, roomMapping.channel, testNoticeText
            );
        });
    });

    it("should bridge IRC topics as Matrix m.room.topic in aliased rooms",
    test.coroutine(function*() {
        const testTopic = "Topics are liek the best thing eletz!";

        const tChannel = "#someotherchannel";
        const tRoomId = roomMapping.roomId;
        const tServer = roomMapping.server;
        const tBotNick = roomMapping.botNick;

        // Use bot client for mocking responses
        const cli = env.clientMock._client(config._botUserId);

        yield cli._setupRoomByAlias(
            env, tBotNick, tChannel, tRoomId, tServer, config.homeserver.domain
        );

        // Use bot client for mocking responses
        const cliUser = env.clientMock._client(tUserId);

        const p = new Promise((resolve, reject) => {
            cliUser.sendStateEvent.and.callFake(function(roomId, type, content, skey) {
                expect(roomId).toEqual(roomMapping.roomId);
                expect(content).toEqual({ topic: testTopic });
                expect(type).toEqual("m.room.topic");
                expect(skey).toEqual("");
                resolve();
                return Promise.resolve();
            });
        });

        let client = yield env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);
        client.emit("topic", tChannel, testTopic, tFromNick);

        yield p;
    }));

    it("should bridge IRC topics as Matrix m.room.topic in aliased rooms, using the bot",
    test.coroutine(function*() {
        const testTopic = "Topics are liek the best thing eletz!";

        const tChannel = "#someotherchannel";
        const tRoomId = roomMapping.roomId;
        const tServer = roomMapping.server;
        const tBotNick = roomMapping.botNick;

        // Use bot client for mocking responses
        const cli = env.clientMock._client(config._botUserId);

        yield cli._setupRoomByAlias(
            env, tBotNick, tChannel, tRoomId, tServer, config.homeserver.domain
        );

        // Use bot client for mocking responses
        const cliUser = env.clientMock._client(tUserId);

        cliUser.sendStateEvent.and.callFake(function() {
            return Promise.reject("Not feeling like it.");
        });

        const p = new Promise((resolve, reject) => {
            cli.sendStateEvent.and.callFake(function(roomId, type, content, skey) {
                expect(roomId).toEqual(roomMapping.roomId);
                expect(content).toEqual({ topic: testTopic });
                expect(type).toEqual("m.room.topic");
                expect(skey).toEqual("");
                resolve();
                return Promise.resolve();
            });
        });

        let client = yield env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);
        client.emit("topic", tChannel, testTopic, tFromNick);

        yield p;
    }));

    it("should be insensitive to the case of the channel",
    function(done) {
        let testText = "this is some test text.";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            expect(content).toEqual({
                body: testText,
                msgtype: "m.text"
            });
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel.toUpperCase(), testText
            );
        });
    });

    it("should bridge IRC formatted text as Matrix's org.matrix.custom.html",
    function(done) {
        let tIrcFormattedText = "This text is \u0002bold\u000f and this is " +
            "\u001funderlined\u000f and this is \u000303green\u000f. Finally, " +
            "this is a \u0002\u001f\u000303mix of all three";
        let tHtmlCloseTags = "</b></u></font>"; // any order allowed
        let tHtmlMain = "This text is <b>bold</b> and this is <u>underlined</u> " +
            'and this is <font color="#009300">green</font>. Finally, ' +
            'this is a <b><u><font color="#009300">mix of all three';
        let tFallback = "This text is bold and this is underlined and this is " +
            "green. Finally, this is a mix of all three";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            // more readily expose non-printing character errors (looking at
            // you \u000f)
            expect(content.body.length).toEqual(tFallback.length);
            expect(content.body).toEqual(tFallback);
            expect(content.format).toEqual("org.matrix.custom.html");
            expect(content.msgtype).toEqual("m.text");
            expect(content.formatted_body.indexOf(tHtmlMain)).toEqual(0);
            // we allow any order of close tags here, so just do a checksum on
            // the remainder
            expect(
                checksum(content.formatted_body.substring(tHtmlMain.length))
            ).toEqual(
                checksum(tHtmlCloseTags)
            );
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel, tIrcFormattedText
            );
        });
    });

    it("should bridge badly formatted IRC text as Matrix's org.matrix.custom.html",
    function(done) {
        let tIrcFormattedText = "\u0002hello \u001d world\u0002 ! \u001d";
        let tHtmlMain = "<b>hello <i> world</i></b><i> ! </i>";
        let tFallback = "hello  world ! ";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            // more readily expose non-printing character errors (looking at
            // you \u000f)
            expect(content.body.length).toEqual(tFallback.length);
            expect(content.body).toEqual(tFallback);
            expect(content.format).toEqual("org.matrix.custom.html");
            expect(content.msgtype).toEqual("m.text");
            expect(content.formatted_body.indexOf(tHtmlMain)).toEqual(0);
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel, tIrcFormattedText
            );
        });
    });

    it("should bridge special regex character formatted IRC colours as Matrix's" +
    "org.matrix.custom.html", function(done) {
        // $& = Inserts the matched substring.
        let tIrcFormattedText = "\u000303$& \u000304 world\u000303 ! \u000304";
        let tHtmlMain = '<font color="#009300">$&amp; </font><font color="#FF0000"> world' +
            '</font><font color="#009300"> ! </font>';
        let tFallback = "$&  world ! ";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            // more readily expose non-printing character errors (looking at
            // you \u000f)
            expect(content.body.length).toEqual(tFallback.length);
            expect(content.body).toEqual(tFallback);
            expect(content.format).toEqual("org.matrix.custom.html");
            expect(content.msgtype).toEqual("m.text");
            expect(content.formatted_body.indexOf(tHtmlMain)).toEqual(0);
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel, tIrcFormattedText
            );
        });
    });

    it("should html escape IRC text", function(done) {
        let tIrcFormattedText = "This text is \u0002bold\u000f and has " +
            "<div> tags & characters like ' and \"";
        let tHtmlMain = "This text is <b>bold</b> and has " +
            "&lt;div&gt; tags &amp; characters like &apos; and &quot;";
        let tFallback = "This text is bold and has <div> tags & characters like ' and \"";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            // more readily expose non-printing character errors (looking at
            // you \u000f)
            expect(content.body.length).toEqual(tFallback.length);
            expect(content.body).toEqual(tFallback);
            expect(content.format).toEqual("org.matrix.custom.html");
            expect(content.msgtype).toEqual("m.text");
            expect(content.formatted_body).toEqual(tHtmlMain);
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel, tIrcFormattedText
            );
        });
    });

    it("should toggle on IRC formatting flags", function(done) {
        let tIrcFormattedText = "This text is \u0002bold\u0002 and \u0002\u0002thats it.";
        let tHtmlMain = "This text is <b>bold</b> and <b></b>thats it.";
        let tFallback = "This text is bold and thats it.";
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            expect(roomId).toEqual(roomMapping.roomId);
            // more readily expose non-printing character errors (looking at
            // you \u000f)
            expect(content.body.length).toEqual(tFallback.length);
            expect(content.body).toEqual(tFallback);
            expect(content.format).toEqual("org.matrix.custom.html");
            expect(content.msgtype).toEqual("m.text");
            expect(content.formatted_body).toEqual(tHtmlMain);
            done();
            return Promise.resolve();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit(
                "message", tFromNick, roomMapping.channel, tIrcFormattedText
            );
        });
    });
});

describe("IRC-to-Matrix operator modes bridging", function() {

    const {env, config, roomMapping, test} = envBundle();

    let botMatrixClient = null;

    const tRealMatrixUserNick = "M-alice";
    const tRealUserId = "@alice:anotherhomeserver";
    const tRealMatrixUserNick2 = "M-bob";
    const tRealUserId2 = "@bob:anotherhomeserver";

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);

        botMatrixClient = env.clientMock._client(config._botUserId);

        env.ircMock._autoJoinChannels(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        env.ircMock._autoConnectNetworks(
            roomMapping.server, tRealMatrixUserNick, roomMapping.server
        );

        env.ircMock._autoJoinChannels(
            roomMapping.server, tRealMatrixUserNick, roomMapping.channel
        );

        env.ircMock._autoConnectNetworks(
            roomMapping.server, tRealMatrixUserNick2, roomMapping.server
        );

        env.ircMock._autoJoinChannels(
            roomMapping.server, tRealMatrixUserNick2, roomMapping.channel
        );

        // do the init
        yield test.initEnv(env).then(() => {
            return env.mockAppService._trigger("type:m.room.message", {
                content: {
                    body: "get me in",
                    msgtype: "m.text"
                },
                user_id: tRealUserId,
                room_id: roomMapping.roomId,
                type: "m.room.message"
            });
        });
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should bridge modes to power levels", async () => {
        // Set IRC user prefix, which in reality is assumed to have happened
        const client = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick);

        client.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick]: "@"
            }
        };

        const promise = new Promise((resolve) => {
            botMatrixClient.sendStateEvent.and.callFake(async (roomId, eventType, content, key) => {
                resolve({roomId, eventType, content, key});
            });
        });
        const cli = await env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);
        cli.emit(
            "+mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick, "here you go"
        );

        const setPowerLevelResult = await promise;
        expect(setPowerLevelResult.roomId).toBe(roomMapping.roomId);
        expect(setPowerLevelResult.eventType).toBe("m.room.power_levels");
        expect(setPowerLevelResult.key).toBe("");
        expect(setPowerLevelResult.content.users[tRealUserId]).toBe(50);
    });

    it("should bridge multiple mode changes as a single power level event", async () => {
        // Set IRC user prefix, which in reality is assumed to have happened
        await env.mockAppService._trigger("type:m.room.message", {
            content: {
                body: "get me in",
                msgtype: "m.text"
            },
            user_id: tRealUserId2,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });

        const client = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick);
        client.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick]: "@",
                [tRealMatrixUserNick2]: "@"
            }
        };

        const client2 = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick2);
        client2.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick2]: "@"
            }
        };

        const promise = new Promise((resolve) => {
            botMatrixClient.sendStateEvent.and.callFake(async (roomId, eventType, content, key) => {
                resolve({roomId, eventType, content, key});
            });
        });

        const cli = await env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);
        cli.emit(
            "+mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick, "here you go"
        );
        cli.emit(
            "+mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick2, "here you go"
        );

        const setPowerLevelResult = await promise;
        expect(setPowerLevelResult.roomId).toBe(roomMapping.roomId);
        expect(setPowerLevelResult.eventType).toBe("m.room.power_levels");
        expect(setPowerLevelResult.key).toBe("");
        expect(setPowerLevelResult.content.users[tRealUserId]).toBe(50);
        expect(setPowerLevelResult.content.users[tRealUserId2]).toBe(50);
    });


    it("should bridge the highest power of multiple modes", async () => {
        // Set IRC user prefix, which in reality is assumed to have happened
        const client = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick);

        // This test simulates MODE +o being received, when the user had previously already had
        // a prefix of "+". So their prefix is updated to "+@", as per node-irc. The expected
        // result is that they should be given power of 50 (= +o).
        client.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick]: "+@"
            }
        };

        const promise = new Promise((resolve) => {
            botMatrixClient.sendStateEvent.and.callFake(async (roomId, eventType, content, key) => {
                resolve({roomId, eventType, content, key});
            });
        });
        const cli = await env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);
        cli.emit(
            "+mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick, "here you go"
        );

        const setPowerLevelResult = await promise;
        expect(setPowerLevelResult.roomId).toBe(roomMapping.roomId);
        expect(setPowerLevelResult.eventType).toBe("m.room.power_levels");
        expect(setPowerLevelResult.key).toBe("");
        expect(setPowerLevelResult.content.users[tRealUserId]).toBe(50);
    });

    it("should bridge the highest power of multiple modes when a higher power mode is removed",
    async function() {
        // Set IRC user prefix, which in reality is assumed to have happened
        const client = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick);

        // This test simulates MODE -o being received, when the user had previously already had
        // a prefix of "+@". So their prefix is updated to "+", as per node-irc. The expected
        // result is that they should be given power of 25 (= +v).
        client.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick]: "+"
            }
        };

        const promise = new Promise((resolve) => {
            botMatrixClient.sendStateEvent.and.callFake(async (roomId, eventType, content, key) => {
                resolve({roomId, eventType, content, key});
            });
        });

        const cli = await env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);

        cli.emit(
            "+mode", roomMapping.channel, "op-er", "v", tRealMatrixUserNick, "here you go"
        );
        cli.emit(
            "-mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick, "here you go"
        );
        const setPowerLevelResult = await promise;
        expect(setPowerLevelResult.roomId).toBe(roomMapping.roomId);
        expect(setPowerLevelResult.eventType).toBe("m.room.power_levels");
        expect(setPowerLevelResult.key).toBe("");
        expect(setPowerLevelResult.content.users[tRealUserId]).toBe(25);
    });

    it("should bridge the highest power of multiple modes when a lower power mode is removed",
    async function() {
        // Set IRC user prefix, which in reality is assumed to have happened
        const client = await env.ircMock._findClientAsync(roomMapping.server, tRealMatrixUserNick);

        // This test simulates MODE -v being received, when the user had previously already had
        // a prefix of "+@". So their prefix is updated to "@", as per node-irc. The expected
        // result is that they should be given power of 50 (= +o).
        client.chans[roomMapping.channel] = {
            users: {
                [tRealMatrixUserNick]: "@"
            }
        };

        const promise = new Promise((resolve) => {
            botMatrixClient.sendStateEvent.and.callFake(async (roomId, eventType, content, key) => {
                resolve({roomId, eventType, content, key});
            });
        });

        const cli = await env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick);

        cli.emit(
            "+mode", roomMapping.channel, "op-er", "o", tRealMatrixUserNick, "here you go"
        );
        cli.emit(
            "-mode", roomMapping.channel, "op-er", "v", tRealMatrixUserNick, "here you go"
        );

        const setPowerLevelResult = await promise;
        expect(setPowerLevelResult.roomId).toBe(roomMapping.roomId);
        expect(setPowerLevelResult.eventType).toBe("m.room.power_levels");
        expect(setPowerLevelResult.key).toBe("");
        expect(setPowerLevelResult.content.users[tRealUserId]).toBe(50);
    });
});

describe("IRC-to-Matrix name bridging", function() {

    const {env, config, roomMapping, test} = envBundle();

    let sdk;
    let tFromNick = "mike";
    let tUserId = "@" + roomMapping.server + "_" + tFromNick + ":" +
                  config.homeserver.domain;

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);

        config.ircService.servers[roomMapping.server].matrixClients.displayName = (
            "Test $NICK and $SERVER"
        );
        config.ircService.servers[roomMapping.server].matrixClients.joinAttempts = 3;
        config.ircService.servers[roomMapping.server].membershipLists.enabled = true;
        config.ircService.servers[
            roomMapping.server
        ].membershipLists.global.ircToMatrix.initial = true;

        sdk = env.clientMock._client(tUserId);

        env.ircMock._autoJoinChannels(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should set the matrix display name from the config file template", function(done) {
        // don't care about registration / sending the event
        sdk.sendEvent.and.callFake(function(roomId, type, content) {
            return Promise.resolve();
        });
        sdk.registerRequest.and.callFake(function() {
            return Promise.resolve({
                user_id: tUserId
            });
        });

        sdk.setDisplayName.and.callFake(function(name) {
            expect(name).toEqual("Test mike and " + roomMapping.server);
            done();
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            client.emit("message", tFromNick, roomMapping.channel, "ping");
        });
    });

    it("should process all NAMEs entries", function(done) {
        let nicks = {
            Alicia: {
                uid: "@" + roomMapping.server + "_Alicia:" + config.homeserver.domain,
            },
            Bertha: {
                uid: "@" + roomMapping.server + "_Bertha:" + config.homeserver.domain,
            },
            Clarissa: {
                uid: "@" + roomMapping.server + "_Clarissa:" + config.homeserver.domain,
            }
        };

        let joined = new Set();
        Object.keys(nicks).forEach(function(n) {
            let cli = env.clientMock._client(nicks[n].uid);
            cli._onHttpRegister({
                expectLocalpart: roomMapping.server + "_" + n,
                returnUserId: nicks[n].uid
            });
            cli.joinRoom.and.callFake(function(r, opts) {
                expect(r).toEqual(roomMapping.roomId);
                joined.add(n);
                if (joined.size === 3) {
                    done();
                }
                return Promise.resolve({room_id: r});
            });

            // don't care about display name
            cli.setDisplayName.and.callFake(function(name) {
                return Promise.resolve({});
            });
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            let names = {
                Alicia: {},
                Bertha: {},
                Clarissa: {}
            };
            client.emit("names", roomMapping.channel, names);
        });
    });
    it("should retry a join", function(done) {
        const nick = "Alicia";
        const uid = `@${roomMapping.server}_${nick}:${config.homeserver.domain}`;
        const cli = env.clientMock._client(uid);

        cli._onHttpRegister({
            expectLocalpart: roomMapping.server + "_" + nick,
            returnUserId: uid
        });

        let count = 3;

        cli.joinRoom.and.callFake(function(r, opts) {
            if (count > 0) {
                count--;
                return Promise.reject({});
            }
            expect(r).toEqual(roomMapping.roomId);
            done();
            return Promise.resolve({room_id: r});
        });

        // don't care about display name
        cli.setDisplayName.and.callFake(function(name) {
            return Promise.resolve({});
        });

        env.ircMock._findClientAsync(roomMapping.server, roomMapping.botNick).then(
        function(client) {
            let names = {
                Alicia: {}
            };
            client.emit("names", roomMapping.channel, names);
        });
    });
});
