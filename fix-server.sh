#!/bin/bash
# Remove all merge conflict markers
sed -i '/^<<<<<<< /d' server.js
sed -i '/^=======$/d' server.js
sed -i '/^>>>>>>> /d' server.js
# Fix optional chaining
sed -i 's/req\.cookies\?\.sessionId/(req.cookies \&\& req.cookies.sessionId)/g' server.js
echo "Fixed merge conflicts"
