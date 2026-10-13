#!/usr/bin/env python3
"""Validate the known Agave ledger layout before an isolated extraction."""
import pathlib
import re
import sys
import tarfile

with tarfile.open(sys.argv[1], 'r:*') as archive:
    members = archive.getmembers()
    by_name = {member.name: member for member in members}
    assert len(members) == len(by_name), 'Duplicate archive member'
    links = []
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts
        assert path.parts and path.parts[0] in ['ledger', 'app', 'operator', 'network.json']
        if member.isdir() or member.isfile():
            continue
        if member.islnk():
            match = re.fullmatch(r'ledger/accounts/snapshot/[0-9]+/([0-9]+\.[0-9]+)', member.name)
            assert match and member.linkname == 'ledger/accounts/run/' + match.group(1)
            assert member.linkname in by_name and by_name[member.linkname].isfile()
            continue
        if member.issym():
            match = re.fullmatch(r'ledger/snapshots/([0-9]+)/accounts_hardlinks/account_path_0', member.name)
            assert match and member.linkname == '/data/ledger/accounts/snapshot/' + match.group(1)
            target = 'ledger/accounts/snapshot/' + match.group(1)
            assert target in by_name and by_name[target].isdir()
            links.append(member.name)
            continue
        raise AssertionError('Unsupported archive member type')
    for path in links:
        assert not any(member.name.startswith(path + '/') for member in members), 'Write through archive symlink'
print('Archive members validated: relative paths and bounded Agave snapshot links')
