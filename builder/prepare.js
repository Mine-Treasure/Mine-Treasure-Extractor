const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const MODRINTH_ID = '5y2R1ofr';

const downloadClientJar = async () => {
    // Fetch version manifest
    const version_manifest = await fetch(
        'https://launchermeta.mojang.com/mc/game/version_manifest.json'
    ).then((res) => res.json());
    const latest_version = version_manifest.latest.release;

    // Find the version manifest for the latest version
    const versionData = version_manifest.versions.find(
        (version) => version.id === latest_version
    );

    // Fetch the version it's manifest json
    const version_manifest_json = await fetch(versionData.url).then((res) =>
        res.json()
    );

    // Fetch the client jar
    const client_jar_request = await fetch(
        version_manifest_json.downloads.client.url
    );
    const fileStream = fs.createWriteStream(
        path.join(__dirname, '../pack/client.jar'),
        { flags: 'wx' }
    );
    await finished(Readable.fromWeb(client_jar_request.body).pipe(fileStream));
};

const downloadDatapack = async () => {
    // Remove old datapack.zip
    if (fs.existsSync(path.join(__dirname, './datapack.zip'))) {
        fs.unlinkSync(path.join(__dirname, './datapack.zip'));
    }

    // Fetch versions from modrinth
    const versions = await fetch(
        `https://api.modrinth.com/v2/project/${MODRINTH_ID}/version`
    ).then((res) => res.json());

    // Find the latest version that is a datapack
    const datapack_version = versions.find((version) =>
        version.name.startsWith('[DP]')
    );

    // Download the latest zip
    // Fetch the client jar
    const datapack_zip_request = await fetch(datapack_version.files[0].url);
    const fileStream = fs.createWriteStream(
        path.join(__dirname, './datapack.zip'),
        { flags: 'wx' }
    );
    await finished(
        Readable.fromWeb(datapack_zip_request.body).pipe(fileStream)
    );

    // Unzip the file
    const unzip = require('unzipper');
    const unzipper = unzip.Extract({ path: path.join(__dirname, '../pack') });
    fs.createReadStream(path.join(__dirname, './datapack.zip')).pipe(unzipper);
};

(async () => {
    // Create pack directory
    if (!fs.existsSync(path.join(__dirname, '../pack'))) {
        fs.mkdirSync(path.join(__dirname, '../pack'));
    }

    // Create out directory
    if (!fs.existsSync(path.join(__dirname, '../out'))) {
        fs.mkdirSync(path.join(__dirname, '../out'));
    }

    await downloadDatapack();
    await downloadClientJar();
    console.log('Prepared client and datapack');
})();
