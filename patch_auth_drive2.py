import re

with open("src/lib/noma/drive.ts", "r") as f:
    drive_content = f.read()

drive_content = drive_content.replace(
    "if (!prompt && accessToken && Date.now() < tokenExpiresAt) return accessToken;",
    "if (!prompt && accessToken && Date.now() < tokenExpiresAt && activeTokenOwner === ownerId) return accessToken;"
)

with open("src/lib/noma/drive.ts", "w") as f:
    f.write(drive_content)

with open("src/lib/noma/auth.tsx", "r") as f:
    auth_content = f.read()

auth_content = auth_content.replace(
    'signOut: async () => {\n        await fbSignOut(requireAuth());\n      },',
    'signOut: async () => {\n        const current = requireAuth().currentUser;\n        if (current) {\n          const { disconnectDrive } = await import("./drive");\n          await disconnectDrive(current.uid);\n        }\n        await fbSignOut(requireAuth());\n      },'
)

with open("src/lib/noma/auth.tsx", "w") as f:
    f.write(auth_content)
