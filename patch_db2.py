import re

with open("src/lib/noma/DatabaseContext.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'try {\n          guestExists = await Dexie.exists("noma_guest");\n        } catch (e) {}',
    'try {\n          guestExists = await Dexie.exists("noma_guest");\n        } catch (e) {\n          console.error("Dexie.exists failed", e);\n        }'
)

with open("src/lib/noma/DatabaseContext.tsx", "w") as f:
    f.write(content)
